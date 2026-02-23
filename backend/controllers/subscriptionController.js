import { validationResult } from "express-validator";
import {prisma} from "../db/db.js";
import crypto from "crypto";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,
    key_secret: process.env.KEY_SECRET,
});

function generateSignature(paymentId, subscriptionId) {
    return crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(paymentId + "|" + subscriptionId)
        .digest("hex");
}

export const verifySubscription = async (req, res) => {
    try {
        // 1️⃣ Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const {
            razorpay_payment_id,
            razorpay_subscription_id,
            razorpay_signature,
            paymentId,
        } = req.body;

        // 2️⃣ Check DB record exists
        const existing = await prisma.payments.findUnique({
            where: { id: paymentId },
        });

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: "Payment record not found",
            });
        }

        if (existing.paymentStatus === "active") {
            return res.status(200).json({
                success: true,
                message: "Subscription already active",
            });
        }

        // 3️⃣ Verify signature securely
        const expectedSignature = generateSignature(
            razorpay_payment_id,
            razorpay_subscription_id
        );

        if (
            !crypto.timingSafeEqual(
                Buffer.from(expectedSignature),
                Buffer.from(razorpay_signature)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid signature",
            });
        }

        // 4️⃣ Fetch payment from Razorpay
        const razorpayPayment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (!razorpayPayment || razorpayPayment.status !== "captured") {
            return res.status(400).json({
                success: false,
                message: "Payment not captured",
            });
        }

        if (
            razorpayPayment.subscription_id !== razorpay_subscription_id
        ) {
            return res.status(400).json({
                success: false,
                message: "Subscription mismatch",
            });
        }

        // 5️⃣ Fetch subscription to confirm status
        const subscription = await razorpay.subscriptions.fetch(
            razorpay_subscription_id
        );

        if (subscription.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Subscription not active",
            });
        }

        // 6️⃣ DB transaction update
        await prisma.$transaction(async (tx) => {
            await tx.payments.update({
                where: { id: paymentId },
                data: {
                    paymentStatus: "active",
                    razorPayPaymentId: razorpay_payment_id,
                    subscriptionId: razorpay_subscription_id,
                },
            });
        });

        return res.status(200).json({
            success: true,
            message: "Subscription verified and activated",
            subscription,
        });

    } catch (error) {
        console.error("Subscription verification error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const createPlan = async (req, res) => {
    try {
        const { amount, interval = 1, period = "monthly" } = req.body;

        // 🔴 Validate input properly
        if (!amount || isNaN(amount)) {
            return res.status(400).json({ message: "Valid amount is required" });
        }

        if (!["daily", "weekly", "monthly", "yearly"].includes(period)) {
            return res.status(400).json({ message: "Invalid period" });
        }

        const plan = await razorpay.plans.create({
            period,
            interval,
            item: {
                name: "Monthly Donation Plan",
                amount: Number(amount) * 100, // convert to paise
                currency: "INR",
            },
        });

        return res.status(200).json({ plan });
    } catch (error) {
        console.error("Create Plan Error:", error);
        return res.status(500).json({
            message: "Error creating plan",
            error: error.message,
        });
    }
};