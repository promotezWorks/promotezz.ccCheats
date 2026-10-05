const https = require('https');

const MONEYMOTION_API_KEY = process.env.MONEYMOTION_API_KEY || 'mk_live_nwoQNRzd1LtfZD7BoGSnAmWUEaF7Mhcz';

const PRICING = {
  cs2: {
    name: 'Counter Strike 2',
    plans: { day: 500, month: 1500, lifetime: 3000 }
  },
  roblox: {
    name: 'Roblox External',
    plans: { day: 300, month: 700, lifetime: 1500 }
  },
  fish: {
    name: 'How To Fish',
    plans: { day: 200, lifetime: 500 }
  }
};

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') {
    try { return Promise.resolve(JSON.parse(req.body)); } catch (e) {}
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ success: false, error: 'Method not allowed' }));
  }

  try {
    const { productId, plan, email } = await readBody(req);
    const product = PRICING[productId];
    if (!product || !product.plans[plan]) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify({ success: false, error: 'Invalid product or plan selected.' }));
    }

    const priceInCents = product.plans[plan];
    const planLabel = plan === 'day' ? '1 Day' : plan === 'month' ? '30 Days' : 'Lifetime';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host || 'prmcheats.com';
    const origin = `${proto}://${host}`;

    const isLocal = origin.includes('localhost') || origin.startsWith('http:');
    const callbackBase = isLocal ? 'https://prmcheats.com' : origin;

    const payload = JSON.stringify({
      description: `${product.name} - ${planLabel} Access`,
      urls: {
        success: `${callbackBase}/?payment=success`,
        failure: `${callbackBase}/?payment=failure`,
        cancel: `${callbackBase}/?payment=cancel`
      },
      userInfo: {
        email: email || 'customer@prmcheats.com'
      },
      lineItems: [
        {
          name: `${product.name} (${planLabel})`,
          pricePerItemInCents: priceInCents,
          quantity: 1,
          description: `${product.name} license access`
        }
      ]
    });

    await new Promise((resolve) => {
      const apiReq = https.request('https://api.moneymotion.io/rpc/CheckoutSessionsCreateCheckoutSession', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': MONEYMOTION_API_KEY,
          'x-currency': 'USD',
          'Content-Length': Buffer.byteLength(payload)
        }
      }, apiRes => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (apiRes.statusCode >= 400 || parsed.error) {
              const msg = (parsed.error && parsed.error.message) || parsed.message || 'Payment provider error';
              res.statusCode = 400;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: msg }));
              return resolve();
            }
            const checkoutUrl = parsed.checkoutUrl || (parsed.checkoutSessionId ? `https://checkout.moneymotion.io/${parsed.checkoutSessionId}` : null);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, checkoutUrl, checkoutSessionId: parsed.checkoutSessionId }));
            resolve();
          } catch (e) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Invalid response from MoneyMotion' }));
            resolve();
          }
        });
      });

      apiReq.on('error', (err) => {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: err.message }));
        resolve();
      });

      apiReq.write(payload);
      apiReq.end();
    });
  } catch (err) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: err.message }));
  }
};
