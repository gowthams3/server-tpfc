import express from "express";
import cors from "cors";
import crypto from "crypto";
import fetch from "node-fetch"; // If using CommonJS or Node <18, install: `npm install node-fetch`

const app = express();
const PORT = 5000;

// Use your credentials here
const MERCHANT_ID = process.env.MERCHANT_ID;
const SALT_KEY = process.env.SALT_KEY;
const SALT_INDEX = process.env.SALT_INDEX;
// const REDIRECT_URL = process.env.REDIRECT_URL;

app.use(cors());
app.use(express.json());

app.post("/api/phonepe/initiate", async (req, res) => {
  try {
    const { amount, orderId, userDetails } = req.body;

    const redirectUrl = `${process.env.BASE_URL}api/phonepe/callback?bookingId=${orderId}`;

    const payload = {
      merchantId: MERCHANT_ID,
      merchantTransactionId: orderId,
      merchantUserId: userDetails.phone,
      amount: amount * 100, // Convert to paise
      redirectUrl,
      redirectMode: "POST",
      callbackUrl: redirectUrl,
      mobileNumber: userDetails.phone,
      paymentInstrument: {
        type: "PAY_PAGE",
      },
    };

    const base64Payload = Buffer.from(JSON.stringify(payload)).toString(
      "base64"
    );
    const stringToSign = base64Payload + "/pg/v1/pay" + SALT_KEY;
    const xVerify =
      crypto.createHash("sha256").update(stringToSign).digest("hex") +
      "###" +
      SALT_INDEX;

    const response = await fetch(
      "https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": MERCHANT_ID,
        },
        body: JSON.stringify({ request: base64Payload }),
      }
    );

    const result = await response.json();

    if (result.success) {
      const redirectUrl = result.data.instrumentResponse.redirectInfo.url;
      return res.json({ success: true, redirectUrl });
    } else {
      return res.json({
        success: false,
        error: result.message || "Unknown error",
      });
    }
  } catch (err) {
    console.error("PhonePe API error:", err);
    return res.json({ success: false, error: "Internal Server Error" });
  }
});

app.get("/api/phonepe/callback", (req, res) => {
  const transactionId = req.query.transactionId;
  const bookingId = req.query.bookingId;

  if (!transactionId || !bookingId) {
    return res.status(400).send("Missing transactionId or bookingId");
  }

  // Redirect to React frontend with transactionId and bookingId
  const frontendUrl = `https://tpfc.in/booking-success?transactionId=${transactionId}&bookingId=${bookingId}`;
  res.redirect(frontendUrl);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
