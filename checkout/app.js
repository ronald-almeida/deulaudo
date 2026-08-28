const form = document.getElementById('checkoutForm');
const generateBtn = document.getElementById('generatePixBtn');
const formAlert = document.getElementById('formAlert');
const formMessage = document.getElementById('formMessage');
const detailsToggle = document.getElementById('detailsToggle');
const detailsPanel = document.getElementById('detailsPanel');
const modal = document.getElementById('pixModal');
const modalQr = document.getElementById('modalQr');
const pixCodeField = document.getElementById('pixCode');
const copyPixBtn = document.getElementById('copyPixBtn');
const zipInput = document.getElementById('zipCode');
let currentPixCode = '';

const touched = new Set();
const fieldNodes = new Map(
  [...document.querySelectorAll('[data-field]')].map((node) => [node.dataset.field, node])
);

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function validEmail(value = '') { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()); }
function normalizePhone(value = '') {
  let phone = digits(value);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  return phone;
}

function personData() {
  return {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim().toLowerCase(),
    phone: normalizePhone(document.getElementById('phone').value),
    taxId: digits(document.getElementById('taxId').value)
  };
}
function addressData() {
  return {
    zipCode: digits(zipInput.value),
    street: document.getElementById('street').value.trim(),
    number: document.getElementById('number').value.trim(),
    complement: document.getElementById('complement').value.trim(),
    district: document.getElementById('district').value.trim(),
    city: document.getElementById('city').value.trim(),
    state: document.getElementById('state').value.trim()
  };
}

function fieldValue(id) {
  const payer = personData();
  const address = addressData();
  return id in payer ? payer[id] : address[id];
}

const validators = {
  name(value) {
    if (value.length < 3 || !value.includes(' ')) return 'Informe nome e sobrenome';
    return '';
  },
  email(value) {
    if (!validEmail(value)) return 'Informe um e-mail válido';
    return '';
  },
  phone(value) {
    if (![10, 11].includes(value.length)) return 'Informe um celular válido com DDD';
    return '';
  },
  taxId(value) {
    if (![11, 14].includes(value.length)) return 'Informe um CPF ou CNPJ válido';
    return '';
  },
  zipCode(value) {
    if (value.length !== 8) return 'Informe um CEP válido';
    return '';
  },
  street(value) {
    if (value.length < 3) return 'O campo deve ter no mínimo 3 caracteres';
    return '';
  },
  number(value) {
    if (!value) return 'O campo é obrigatório';
    return '';
  },
  complement() { return ''; },
  district(value) {
    if (!value) return 'O campo é obrigatório';
    return '';
  },
  city(value) {
    if (!value) return 'O campo é obrigatório';
    return '';
  },
  state(value) {
    if (String(value).trim().length !== 2) return 'Selecione um estado';
    return '';
  }
};

function setFieldState(id, message) {
  const node = fieldNodes.get(id);
  if (!node) return;
  const meta = node.querySelector('.field-meta');
  const mark = node.querySelector('.field-mark');
  node.classList.remove('is-valid', 'is-invalid');
  if (meta) meta.textContent = '';
  if (mark) mark.textContent = '';

  const rawValue = fieldValue(id);
  const hasValue = String(rawValue ?? '').trim() !== '';
  if (!touched.has(id) && !hasValue) return;

  if (message) {
    node.classList.add('is-invalid');
    if (meta) meta.textContent = message;
    if (mark) mark.textContent = '✕';
    return;
  }

  if (hasValue || id === 'state') {
    node.classList.add('is-valid');
    if (mark) mark.textContent = '✓';
  }
}

function validateField(id, { markTouched = false } = {}) {
  if (markTouched) touched.add(id);
  const validator = validators[id];
  const message = validator ? validator(fieldValue(id)) : '';
  setFieldState(id, message);
  return message;
}

function validateAll({ markTouched = false } = {}) {
  const order = ['name', 'email', 'phone', 'taxId', 'zipCode', 'street', 'number', 'district', 'city', 'state'];
  let firstError = '';
  order.forEach((id) => {
    const error = validateField(id, { markTouched });
    if (!firstError && error) firstError = error;
  });
  if (firstError) return { error: firstError };
  return { payer: personData(), address: addressData() };
}

function setMessage(message = '') {
  formMessage.textContent = message;
  formAlert.classList.toggle('hidden', !message);
}

function updateReadyState() {
  const result = validateAll({ markTouched: false });
  generateBtn.classList.toggle('ready', !result.error);
}

function formatGatewayDetails(details) {
  if (!details) return '';
  if (Array.isArray(details)) {
    return details
      .map((item) => typeof item === 'string' ? item : item?.message || item?.field || JSON.stringify(item))
      .filter(Boolean)
      .join(' | ');
  }
  if (typeof details === 'object') {
    return Object.entries(details)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`)
      .join(' | ');
  }
  return String(details);
}

function renderQr(code) {
  modalQr.innerHTML = '';
  if (typeof QRCode !== 'function') throw new Error('Não foi possível carregar o gerador de QR Code.');
  new QRCode(modalQr, { text: code, width: 230, height: 230, correctLevel: QRCode.CorrectLevel.M });
}
function openModal() { modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }
function closeModal() { modal.classList.add('hidden'); document.body.style.overflow = ''; }

async function copyText(text, button) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
  }
  const old = button.textContent;
  button.textContent = 'Código Pix copiado!';
  setTimeout(() => { button.textContent = old; }, 1800);
}

async function lookupZip() {
  const zip = digits(zipInput.value);
  if (zip.length !== 8) return;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
    const data = await response.json();
    if (!response.ok || data.erro) return;
    if (data.logradouro) document.getElementById('street').value = data.logradouro;
    if (data.bairro) document.getElementById('district').value = data.bairro;
    if (data.localidade) document.getElementById('city').value = data.localidade;
    if (data.uf) document.getElementById('state').value = data.uf;
    ['zipCode', 'street', 'district', 'city', 'state'].forEach((id) => validateField(id, { markTouched: touched.has(id) }));
    updateReadyState();
  } catch {
    // preenchimento manual segue disponível
  }
}

detailsToggle.addEventListener('click', () => {
  const open = detailsToggle.getAttribute('aria-expanded') === 'true';
  detailsToggle.setAttribute('aria-expanded', String(!open));
  detailsPanel.classList.toggle('hidden', open);
});

['phone', 'taxId', 'zipCode'].forEach((id) => {
  document.getElementById(id).addEventListener('input', (event) => {
    const max = id === 'taxId' ? 14 : id === 'zipCode' ? 8 : 11;
    event.target.value = digits(event.target.value).slice(0, max);
  });
});

Object.keys(validators).forEach((id) => {
  const input = document.getElementById(id);
  if (!input) return;
  input.addEventListener('blur', async () => {
    validateField(id, { markTouched: true });
    if (id === 'zipCode') await lookupZip();
    updateReadyState();
  });
  input.addEventListener('input', () => {
    if (touched.has(id)) validateField(id, { markTouched: false });
    setMessage('');
    updateReadyState();
  });
  input.addEventListener('change', () => {
    if (touched.has(id)) validateField(id, { markTouched: false });
    updateReadyState();
  });
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  const data = validateAll({ markTouched: true });
  if (data.error) {
    setMessage(data.error);
    return;
  }

  const oldText = generateBtn.textContent;
  generateBtn.disabled = true;
  generateBtn.textContent = 'Gerando Pix...';
  try {
    const response = await fetch('/api/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer: data.payer, address: data.address })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      const details = formatGatewayDetails(result.details);
      throw new Error([result.message || 'Não foi possível gerar o Pix.', details].filter(Boolean).join(' — '));
    }
    currentPixCode = result.pixCode;
    pixCodeField.value = currentPixCode;
    renderQr(currentPixCode);
    openModal();
  } catch (error) {
    setMessage(error.message || 'Erro ao gerar o Pix.');
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = oldText;
    updateReadyState();
  }
});

copyPixBtn.addEventListener('click', () => copyText(currentPixCode, copyPixBtn));
document.querySelectorAll('[data-close-modal]').forEach((el) => el.addEventListener('click', closeModal));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeModal(); });

updateReadyState();
