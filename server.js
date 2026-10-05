const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8080;
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

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

function createMoneyMotionCheckout({ productId, plan, email, origin }) {
  return new Promise((resolve, reject) => {
    const product = PRICING[productId];
    if (!product || !product.plans[plan]) {
      return reject(new Error('Invalid product or plan selected.'));
    }

    const priceInCents = product.plans[plan];
    const planLabel = plan === 'day' ? '1 Day' : plan === 'month' ? '30 Days' : 'Lifetime';

    const isLocal = !origin || origin.includes('localhost') || origin.startsWith('http:');
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

    const req = https.request('https://api.moneymotion.io/rpc/CheckoutSessionsCreateCheckoutSession', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': MONEYMOTION_API_KEY,
        'x-currency': 'USD',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400 || parsed.error) {
            const msg = (parsed.error && parsed.error.message) || parsed.message || 'Payment provider error';
            return reject(new Error(msg));
          }
          const checkoutUrl = parsed.checkoutUrl || (parsed.checkoutSessionId ? `https://checkout.moneymotion.io/${parsed.checkoutSessionId}` : null);
          resolve({ checkoutUrl, checkoutSessionId: parsed.checkoutSessionId });
        } catch (e) {
          reject(new Error('Invalid response from MoneyMotion'));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8080'}`);

    // API: Create MoneyMotion Checkout Session
    if (req.method === 'POST' && parsedUrl.pathname === '/api/create-checkout') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', async () => {
        try {
          const { productId, plan, email } = JSON.parse(body || '{}');
          const origin = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost:8080'}`;
          const result = await createMoneyMotionCheckout({ productId, plan, email, origin });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, ...result }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // Static files
    let urlPath = decodeURIComponent(parsedUrl.pathname);
    if (urlPath === '/') urlPath = '/index.html';
    const filePath = path.join(ROOT, urlPath);
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found: ' + urlPath);
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, () => {
  console.log(`PRM CHEATS server running on http://localhost:${PORT}`);
});

