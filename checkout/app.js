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
let currentPixCode = '';

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function validEmail(value = '') { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()); }
function normalizePhone(value = '') {
  let phone = digits(value);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  return phone;
}
function payerData() {
  return {
    name: document.getElementById('name').value.trim(),
    email: document.getElementById('email').value.trim().toLowerCase(),
    phone: normalizePhone(document.getElementById('phone').value),
    taxId: digits(document.getElementById('taxId').value)
  };
}
function validate() {
  const payer = payerData();
  if (payer.name.length < 3 || !payer.name.includes(' ')) return { error: 'Informe nome e sobrenome.' };
  if (!validEmail(payer.email)) return { error: 'Informe um e-mail válido.' };
  if (![10, 11].includes(payer.phone.length)) return { error: 'Informe um celular válido com DDD.' };
  if (![11, 14].includes(payer.taxId.length)) return { error: 'Informe um CPF ou CNPJ válido.' };
  return { payer };
}
function setMessage(message = '') {
  formMessage.textContent = message;
  formAlert.classList.toggle('hidden', !message);
}
function updateReadyState() { generateBtn.classList.toggle('ready', !validate().error); }
function formatGatewayDetails(details) {
  if (!details) return '';
  if (Array.isArray(details)) return details.map((item) => typeof item === 'string' ? item : item?.message || item?.field || JSON.stringify(item)).filter(Boolean).join(' | ');
  if (typeof details === 'object') return Object.entries(details).map(([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`).join(' | ');
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
    helper.value = text; helper.style.position = 'fixed'; helper.style.opacity = '0';
    document.body.appendChild(helper); helper.select(); document.execCommand('copy'); helper.remove();
  }
  const old = button.textContent; button.textContent = 'Código Pix copiado!';
  setTimeout(() => { button.textContent = old; }, 1800);
}

detailsToggle.addEventListener('click', () => {
  const open = detailsToggle.getAttribute('aria-expanded') === 'true';
  detailsToggle.setAttribute('aria-expanded', String(!open));
  detailsPanel.classList.toggle('hidden', open);
});
['phone', 'taxId'].forEach((id) => {
  document.getElementById(id).addEventListener('input', (event) => {
    event.target.value = digits(event.target.value).slice(0, id === 'taxId' ? 14 : 11);
    setMessage('');
    updateReadyState();
  });
});
document.querySelectorAll('input').forEach((el) => el.addEventListener('input', () => { setMessage(''); updateReadyState(); }));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage('');
  const data = validate();
  if (data.error) { setMessage(data.error); return; }
  const oldText = generateBtn.textContent;
  generateBtn.disabled = true; generateBtn.textContent = 'Gerando Pix...';
  try {
    const response = await fetch('/api/create-pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer: data.payer })
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
