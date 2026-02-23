import {prisma} from '../db/db.js'; 
// import razorpay from 'razorpay';
import crypto from "crypto";
import { validationResult } from 'express-validator'

import nodemailer from "nodemailer";
import { fileURLToPath } from "url";

import Razorpay from "razorpay";

import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { generateInvoice } from '../utils/invoice.js';

const razorpay = new Razorpay({
    key_id: process.env.KEY_ID,        // ❌ NEVER use NEXT_PUBLIC in backend
    key_secret: process.env.KEY_SECRET
});

export const createOrder = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            address,
            country,
            state,
            pincode,
            dob,
            comments,
            amount,
            panNo,
            aadharNo
        } = req.body;

        const amountInNum = Number(amount);

        console.log(name,email,phone,address,country,state,pincode,dob,amount,panNo,aadharNo);

        // ⚠️ Put validation back. Don’t run production code without it.
        if (!name || !email || !phone || !address || !country || !state || !pincode || !dob || !amount || !panNo || !aadharNo) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (typeof amountInNum !== 'number' || amountInNum < 1) {
            return res.status(400).json({ message: "Amount must be greater than 0" });
        }

        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: amountInNum * 100, // paisa
            currency: "INR"
        });

        // Save to DB
        const payment = await prisma.payments.create({
            data: {
                name,
                email,
                phone,
                address,
                country,
                state,
                panNo,
                aadharNo,
                pincode,
                dob: new Date(dob),
                comments,
                amount: Number(amount),
                razorpayOrderId: order.id,
            }
        });

        return res.status(200).json({
            ...order,
            paymentId: payment.id
        });

    } catch (error) {
        console.error("Create Order Error:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
};



export const createPlan = async (req, res) => {
    try {
        const { amount, interval = 1, period = "monthly" } = req.body;

        // Basic validation (don't skip this)
        if (!amount || typeof amount !== "number" || amount < 1) {
            return res.status(400).json({ message: "Invalid amount" });
        }

        const validPeriods = ["daily", "weekly", "monthly", "yearly"];
        if (!validPeriods.includes(period)) {
            return res.status(400).json({ message: "Invalid period type" });
        }

        const plan = await razorpay.plans.create({
            period,
            interval,
            item: {
                name: "Monthly Donation Plan",
                amount: amount * 100, // convert to paise
                currency: "INR",
            },
        });

        return res.status(200).json({ plan });

    } catch (err) {
        console.error("Create Plan Error:", err);
        return res.status(500).json({ message: "Error creating plan" });
    }
};


export const createSubscription = async (req, res) => {
    try {
        // Check validation errors first
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const {
            planId,
            name,
            email,
            phone,
            address,
            country,
            state,
            pincode,
            dob,
            panNo,
            aadharNo,
            total_count,
            comments,
            amount,
        } = req.body;

        // Extra defensive checks
        if (!planId) {
            return res.status(400).json({
                success: false,
                message: "Invalid planId",
            });
        }

        // Create Razorpay subscription
        const subscription = await razorpay.subscriptions.create({
            plan_id: planId,
            total_count: total_count || 12,
            customer_notify: 1,
        });

        // Save in DB
        const payment = await prisma.payments.create({
            data: {
                name,
                email,
                phone,
                address,
                country,
                state,
                panNo,
                aadharNo,
                pincode,
                dob: new Date(dob),
                comments,
                amount: Number(amount),
                subscriptionId: subscription.id,
                paymentStatus: "pending",
            },
        });

        return res.status(200).json({
            success: true,
            subscriptionId: subscription.id,
            paymentId: payment.id,
        });

    } catch (error) {
        console.error("Subscription Error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
        });
    }
};


// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);
// const INVOICE_DIR = path.join(__dirname, "../uploads/invoices");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const INVOICE_DIR = path.join(__dirname, "../uploads/");
// export const downloadInvoice = async (req, res) => {
//     try {
//         const { file } = req.params;
// console.log(file)
//         // 1️⃣ Required check
//         if (!file) {
//             return res.status(400).json({ error: "File name required" });
//         }

//         // 2️⃣ Strict filename validation
//         const safeFilePattern = /^[a-zA-Z0-9_-]+\.pdf$/;

//         if (!safeFilePattern.test(file)) {
//             return res.status(400).json({ error: "Invalid file name" });
//         }

//         // 3️⃣ Build safe absolute path
//         const filePath = path.resolve(INVOICE_DIR, file);

//         // 4️⃣ Prevent path traversal
//         if (!filePath.startsWith(path.resolve(INVOICE_DIR))) {
//             return res.status(403).json({ error: "Access denied" });
//         }

//         // 5️⃣ Check existence (async version preferred)
//         await fs.promises.access(filePath);

//         // 6️⃣ Secure headers
//         res.setHeader("Content-Type", "application/pdf");
//         res.setHeader(
//             "Content-Disposition",
//             `attachment; filename="${path.basename(file)}"`
//         );
//         res.setHeader("X-Content-Type-Options", "nosniff");

//         // 7️⃣ Stream safely
//         const stream = fs.createReadStream(filePath);
//         stream.pipe(res);

//     } catch (err) {
//         if (err.code === "ENOENT") {
//             return res.status(404).json({ error: "File not found" });
//         }

//         console.error("Download invoice error:", err);
//         return res.status(500).json({ error: "Internal Server Error" });
//     }
// };

export const downloadInvoice = async (req, res) => {
    try {
        const { file } = req.params;

        if (!file) {
            return res.status(400).json({ error: "File name required" });
        }

        // Strict filename validation
        const safeFilePattern = /^[a-zA-Z0-9_-]+\.pdf$/;

        if (!safeFilePattern.test(file)) {
            return res.status(400).json({ error: "Invalid file name" });
        }

        // Absolute safe path
        const filePath = path.join(INVOICE_DIR, file);
        console.log(filePath)
        // Extra security check (prevents traversal)
        if (!filePath.startsWith(INVOICE_DIR)) {
            return res.status(403).json({ error: "Access denied" });
        }

        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: "File not found" });
        }
        console.log(filePath,file)
        // Send file directly (simpler + safer than manual stream)
        return res.download(filePath, file);

    } catch (err) {
        console.error("Download invoice error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
};


export const getPayments = async (req, res) => {
    try {
        // 1️⃣ Validate query params
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        let { page = 1, limit = 10, filter = "all" } = req.query;

        page = parseInt(page);
        limit = parseInt(limit);

        // 2️⃣ Hard cap limit (VERY important)
        if (limit > 100) limit = 100;

        const skip = (page - 1) * limit;

        const now = new Date();
        let startDate = null;
        let endDate = null;

        if (filter === "this_month") {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        }

        if (filter === "last_month") {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const whereClause =
            startDate && endDate
                ? {
                    createdAt: {
                        gte: startDate,
                        lt: endDate,
                    },
                }
                : {};

        const [payments, total] = await Promise.all([
            prisma.payments.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
            }),
            prisma.payments.count({ where: whereClause }),
        ]);

        return res.status(200).json({
            success: true,
            data: payments,
            total,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
        });

    } catch (error) {
        console.error("Fetch payments error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};


// controllers/paymentController.js



const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

function generateSignature(orderId, paymentId) {
    return crypto
        .createHmac("sha256", process.env.KEY_SECRET)
        .update(orderId + "|" + paymentId)
        .digest("hex");
}

// async function generateInvoice(details) {
//     const pdfDoc = await PDFDocument.create();
//     const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

//     const page = pdfDoc.addPage([595, 842]);

//     page.drawText("Donation Receipt", { x: 50, y: 800, size: 18 });
//     page.drawText(`Receipt No: ${details.paymentId}`, { x: 50, y: 770 });
//     page.drawText(`Name: ${details.name}`, { x: 50, y: 750 });
//     page.drawText(`Amount: ₹${details.amount}`, { x: 50, y: 730 });

//     const pdfBytes = await pdfDoc.save();

//     const invoiceDir = path.join(__dirname, "../invoices");
//     if (!fs.existsSync(invoiceDir)) {
//         fs.mkdirSync(invoiceDir, { recursive: true });
//     }

//     const fileName = `${details.paymentId}.pdf`;
//     const filePath = path.join(invoiceDir, fileName);

//     fs.writeFileSync(filePath, pdfBytes);

//     return { fileName, filePath };
// }

export const verifyPayment = async (req, res) => {
    try {
        // 1️⃣ Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpaySignature,
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

        if (existing.paymentStatus === "success") {
            return res.status(200).json({
                success: true,
                message: "Already processed",
            });
        }

        // 3️⃣ Verify signature server-side
        const expectedSig = generateSignature(
            razorpay_order_id,
            razorpay_payment_id
        );

        if (
            !crypto.timingSafeEqual(
                Buffer.from(expectedSig),
                Buffer.from(razorpaySignature)
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid signature",
            });
        }

        // 4️⃣ OPTIONAL BUT STRONGLY RECOMMENDED:
        // Fetch payment from Razorpay to confirm amount & status
        const razorpayPayment = await razorpay.payments.fetch(
            razorpay_payment_id
        );

        if (razorpayPayment.status !== "captured") {
            return res.status(400).json({
                success: false,
                message: "Payment not captured",
            });
        }

        if (razorpayPayment.amount !== existing.amount * 100) {
            return res.status(400).json({
                success: false,
                message: "Amount mismatch",
            });
        }

        // 5️⃣ DB transaction
        await prisma.$transaction(async (tx) => {
            await tx.payments.update({
                where: { id: paymentId },
                data: {
                    razorPayPaymentId: razorpay_payment_id,
                    razorpaySignature,
                    paymentStatus: "success",
                },
            });
        });

       
        
        const { fileName, filePath }  = await generateInvoice({
            paymentId: razorpay_payment_id,
            donorName: existing.name,
            donorEmail: existing.email,
            donorAddress: existing.address,
            donorPAN: existing.panNo,
            amount: existing.amount,
            date: existing.createdAt,
        });

        await prisma.payments.update({
            where: { id: paymentId },
            data: { invoice: fileName },
        });

        // 7️⃣ Send Emails
        await transporter.sendMail({
            from: `"Foundation" <${process.env.EMAIL_USER}>`,
            to: existing.email,
            subject: "Donation Receipt",
            text: `Thank you for your donation of Rs. ${existing.amount}`,
            attachments: [{ filename: fileName, path: filePath }],
        });

        console.log("sdfadsfasd",fileName)

        return res.status(200).json({
            success: true,
            message: "Payment verified successfully",
            invoice: fileName,
        });

    } catch (error) {
        console.error("Payment verification error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};