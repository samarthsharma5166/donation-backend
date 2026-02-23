import crypto from "crypto";
import {prisma} from "../db/db.js";
import nodemailer from "nodemailer";
import path from "path";
import fs from "fs";
import Razorpay from "razorpay";
import { generateInvoice } from "../utils/invoice.js";

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const INVOICE_DIR = "/var/www/invoice";

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET,
});

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS,
    },
});

// ---------- Secure Signature Verification ----------
function verifySignature(rawBody, signature) {
    const expected = crypto
        .createHmac("sha256", WEBHOOK_SECRET)
        .update(rawBody)
        .digest("hex");

    if (!signature || expected.length !== signature.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
    );
}

// ---------- Webhook Handler ----------
export const handleRazorpayWebhook = async (req, res) => {
    try {
        const rawBody = req.body; // Buffer (because express.raw)
        const signature = req.headers["x-razorpay-signature"];

        if (!verifySignature(rawBody, signature)) {
            return res.status(400).json({ error: "Invalid signature" });
        }

        const event = JSON.parse(rawBody.toString());

        // Only process captured payments
        if (event.event !== "payment.captured") {
            return res.status(200).json({ ok: true });
        }

        const payment = event.payload.payment.entity;

        // Extra verification from Razorpay (strongly recommended)
        const razorpayPayment = await razorpay.payments.fetch(payment.id);

        if (razorpayPayment.status !== "captured") {
            return res.status(400).json({ error: "Payment not captured" });
        }

        await prisma.$transaction(async (tx) => {
            const existing = await tx.payments.findFirst({
                where: { razorpayOrderId: payment.order_id },
            });

            if (!existing) return;

            if (existing.paymentStatus === "success") return;

            if (razorpayPayment.amount !== existing.amount * 100) {
                throw new Error("Amount mismatch");
            }

            const updated = await tx.payments.update({
                where: { id: existing.id },
                data: {
                    razorPayPaymentId: payment.id,
                    paymentStatus: "success",
                    razorpaySignature: signature,
                },
            });

            const address = `${updated.address}, ${updated.state}, ${updated.country}, ${updated.pincode}`;

            const invoiceFile = await generateInvoice({
                donorName: updated.name || "Anonymous Donor",
                donorEmail: updated.email || "N/A",
                donorAddress: address,
                donorPAN: updated.panNo,
                amount: updated.amount,
                paymentId: payment.id,
                date: new Date(),
            });

            await tx.payments.update({
                where: { id: updated.id },
                data: { invoice: invoiceFile },
            });

            const filePath = path.join(INVOICE_DIR, invoiceFile);

            // ---------- Send Emails ----------
            const mailUser = {
                from: `"Madhavam Foundation" <${EMAIL_USER}>`,
                to: updated.email,
                subject: "Your Donation Receipt - Madhavam Foundation",
                html: `<p>Dear ${updated.name}, thank you for your donation of ₹${updated.amount}. The receipt is attached.</p>`,
                attachments: [{ filename: invoiceFile, path: filePath }],
            };

            const mailAdmin = {
                from: `"Madhavam Foundation" <${EMAIL_USER}>`,
                to: "madhavamfoundation99@gmail.com",
                subject: `New Donation ₹${updated.amount}`,
                html: `<p>Payment ID: ${payment.id}<br/>Donor: ${updated.name}</p>`,
                attachments: [{ filename: invoiceFile, path: filePath }],
            };

            await transporter.sendMail(mailUser);
            await transporter.sendMail(mailAdmin);
        });

        return res.status(200).json({ ok: true });

    } catch (err) {
        console.error("Webhook error:", err);
        return res.status(500).json({ error: "Server error" });
    }
};