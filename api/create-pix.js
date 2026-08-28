const API_BASE = 'https://api.gatewaypayshark.com.br';

const PRODUCT = Object.freeze({
  name: 'Pré-CBR - Extensivo',
  description: 'Pré-CBR - Extensivo',
  amount: 69700,
  currency: 'BRL',
  type: 'DIGITAL'
});

function digits(value = '') { return String(value).replace(/\D/g, ''); }
function validEmail(value = '') { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim()); }
function normalizePhone(value = '') {
  let phone = digits(value);
  if ((phone.length === 12 || phone.length === 13) && phone.startsWith('55')) phone = phone.slice(2);
  return phone;
}
function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}
function normalizePayer(input = {}) {
  return {
    name: String(input.name || '').trim(),
    email: String(input.email || '').trim().toLowerCase(),
    phone: normalizePhone(input.phone),
    taxId: digits(input.taxId)
  };
}
function normalizeAddress(input = {}) {
  return {
    zipCode: digits(input.zipCode),
    street: String(input.street || '').trim(),
    number: String(input.number || '').trim(),
    complement: String(input.complement || '').trim(),
    district: String(input.district || '').trim(),
    city: String(input.city || '').trim(),
    state: String(input.state || '').trim().toUpperCase()
  };
}
function validatePayer(payer) {
  if (payer.name.length < 3 || !payer.name.includes(' ')) return 'Informe nome e sobrenome.';
  if (!validEmail(payer.email)) return 'Informe um e-mail válido.';
  if (![10, 11].includes(payer.phone.length)) return 'Informe um celular válido com DDD.';
  if (![11, 14].includes(payer.taxId.length)) return 'Informe um CPF ou CNPJ válido.';
  return '';
}
function validateAddress(address) {
  if (address.zipCode.length !== 8) return 'Informe um CEP válido.';
  if (address.street.length < 3) return 'Informe o endereço corretamente.';
  if (!address.number) return 'Informe o número do endereço.';
  if (!address.district) return 'Informe o bairro.';
  if (!address.city) return 'Informe a cidade.';
  if (address.state.length !== 2) return 'Informe o estado.';
  return '';
}
function makeExternalRef() { return `deulaudo_precbr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`; }

module.exports = async function handler(req, res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      service: 'create-pix',
      product: PRODUCT.name,
      amount: PRODUCT.amount,
      apiKeyConfigured: Boolean(String(process.env.PAYSHARK_API_KEY || '').trim())
    });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ success: false, message: 'Método não permitido.' });
  }

  try {
    const apiKey = String(process.env.PAYSHARK_API_KEY || '').trim();
    if (!apiKey) return res.status(500).json({ success: false, message: 'Configuração de pagamento indisponível.' });

    const body = parseBody(req);
    const payer = normalizePayer(body.payer);
    const address = normalizeAddress(body.address);
    const payerError = validatePayer(payer);
    if (payerError) return res.status(400).json({ success: false, message: payerError });
    const addressError = validateAddress(address);
    if (addressError) return res.status(400).json({ success: false, message: addressError });

    const externalRef = makeExternalRef();
    const payload = {
      amount: PRODUCT.amount,
      currency: PRODUCT.currency,
      method: 'PIX',
      description: PRODUCT.description,
      externalRef,
      payer,
      items: [{ quantity: 1, name: PRODUCT.name, price: PRODUCT.amount, type: PRODUCT.type }]
    };

    // O checkout coleta endereço, mas o produto é DIGITAL.
    // O endereço não é enviado em delivery para evitar validações desnecessárias do gateway.

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let providerResponse;
    try {
      providerResponse = await fetch(`${API_BASE}/v1/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } finally { clearTimeout(timeout); }

    const raw = await providerResponse.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw || 'Resposta inválida do gateway.' }; }

    if (!providerResponse.ok) {
      return res.status(providerResponse.status >= 500 ? 502 : providerResponse.status).json({
        success: false,
        message: data?.message || data?.errorMessage || 'Não foi possível gerar o Pix.',
        gatewayStatus: providerResponse.status,
        details: data?.errors || data?.error || data?.details || null
      });
    }

    const pixCode = data?.data?.copypaste;
    if (!pixCode) return res.status(502).json({ success: false, message: 'O gateway não retornou o código Pix.' });

    return res.status(200).json({ success: true, paymentId: data?.id || null, externalRef, amount: PRODUCT.amount, pixCode });
  } catch (error) {
    if (error?.name === 'AbortError') return res.status(504).json({ success: false, message: 'O serviço de pagamento demorou para responder. Tente novamente.' });
    console.error('Erro interno ao criar Pix:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao gerar o Pix. Tente novamente.' });
  }
};
