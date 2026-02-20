import Razorpay from 'razorpay';

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  console.warn('⚠️  Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env.local');
}

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

export { razorpayInstance };
