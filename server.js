import express from "express";
import cors from "cors";
import crypto from "crypto";
import fetch from "node-fetch";

const app = express();
const PORT = 5000;

// Use your credentials here
const MERCHANT_ID = process.env.MERCHANT_ID;
const SALT_KEY = process.env.SALT_KEY;
const SALT_INDEX = process.env.SALT_INDEX;
// const REDIRECT_URL = process.env.REDIRECT_URL;

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.text({ type: "*/*" }));

app.use((req, res, next) => {
  console.log("🔍 Incoming Request");
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);
  console.log("Query:", req.query);
  console.log("Body:", req.body);
  next();
});

app.post("/api/phonepe/initiate", async (req, res) => {
  try {
    const { amount, orderId, userDetails } = req.body;

    const redirectUrl = `${process.env.BASE_URL}payment-tpfc/api/phonepe/callback?bookingId=${orderId}`;

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


app.all("/payment-tpfc/api/phonepe/verify", async (req, res) => {
  const { transactionId } = req.query;

  if (!transactionId) {
    return res.status(400).json({ success: false, message: "Missing transactionId" });
  }

  const xVerify =
    crypto
      .createHash("sha256")
      .update(`/pg/v1/status/${MERCHANT_ID}/${transactionId}` + SALT_KEY)
      .digest("hex") + "###" + SALT_INDEX;

  console.log("Verifying transaction:", transactionId);

  try {
    const response = await fetch(
      `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/status/${MERCHANT_ID}/${transactionId}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-MERCHANT-ID": MERCHANT_ID,
        },
      }
    );

    const result = await response.json();

    if (result.success) {
      return res.json({ success: true, status: result.data.status }); // "COMPLETED" or "FAILED"
    } else {
      return res.json({ success: false, status: "FAILED", message: result.message });
    }
  } catch (err) {
    console.error("Error verifying payment:", err);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});



// app.post("/payment-tpfc/api/phonepe/callback", (req, res) => {
//   try {
//     const { response } = req.body;
//     const { bookingId } = req.query;

//     console.log("response", response);
//     console.log("bookingId", bookingId);

//     if (!response || !bookingId) {
//       return res.status(400).send("Missing response or bookingId");
//     }

//     const decoded = JSON.parse(Buffer.from(response, "base64").toString("utf-8"));
//     const transactionId = decoded.data?.transactionId;

//     if (!transactionId) {
//       return res.status(400).send("Missing transactionId in decoded response");
//     }

//     const redirectUrl = `https://tpfc.in/payment-tpfc/booking-success?transactionId=${transactionId}&bookingId=${bookingId}`;
//     return res.redirect(redirectUrl);
//   } catch (error) {
//     console.error("Callback decode error:", error);
//     return res.status(500).send("Internal Server Error");
//   }
// });


app.all("/payment-tpfc/api/phonepe/callback", async (req, res) => {
  const responseBase64 = req.body?.response || req.query?.response;
  const bookingId = req.query?.bookingId;

  console.log("📦 Encoded Response:", responseBase64);
  console.log("📦 Booking ID:", bookingId);
  console.log("📨 Method:", req.method);
  console.log("🧪 Headers:", req.headers);
  console.log("🧪 Body Type:", typeof req.body);
  console.log("🧪 Body:", req.body);
  console.log("🧪 Query:", req.query);

  try {
    let transactionId = null;

    // ✅ Case 1: Encoded base64 response
    if (responseBase64) {
      const decoded = JSON.parse(Buffer.from(responseBase64, "base64").toString("utf-8"));
      transactionId = decoded?.data?.transactionId;
    }

    // ✅ Case 2: Direct values in body (fallback)
    if (!transactionId && req.body?.transactionId) {
      transactionId = req.body.transactionId;
    }

    if (!transactionId || !bookingId) {
      console.warn("⚠️ Missing transactionId or bookingId");
      return res.status(400).send("Missing transactionId or bookingId");
    }

    // Optional: Update DB or trigger email, etc.

    const redirectUrl = `http://localhost:5173/payment-tpfc/booking-success?transactionId=${transactionId}&bookingId=${bookingId}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    console.error("❌ Callback decode error:", error);
    return res.status(500).send("Internal Server Error");
  }
});





// // 👇 Place these two lines after your route handlers
// app.post("/payment-tpfc/api/phonepe/callback", handlePhonePeCallback);
// app.get("/payment-tpfc/api/phonepe/callback", handlePhonePeCallback);




app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
