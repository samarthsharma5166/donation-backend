import dotenv from 'dotenv'
dotenv.config();
import express from 'express';
import { createOrder, createSubscription, downloadInvoice, getPayments, verifyPayment } from './controllers/payments.controllers.js';
import helmet from 'helmet'
import { adminLogin, adminLogout } from './controllers/auth.controllers.js';
import { body, query } from "express-validator";
import  rateLimit from "express-rate-limit";
import { verifyAdmin } from './middleware/authMiddleware.js';
import { handleRazorpayWebhook } from './controllers/webhook.controller.js';
import { createAdmin } from './controllers/admin.controller.js'
import {createPlan, verifySubscription} from './controllers/subscriptionController.js'
import {createBlog, deleteBlog, getBlogs, getSingleBlog} from './controllers/blogs.controller.js'
import cookieParser from 'cookie-parser';
import path from 'path'
import { upload } from './middleware/upload.js';
import cors from 'cors'


const app = express();

app.use(cors({
    origin:"http://localhost:3000",
    credentials:true
}))

// Security headers
app.use(helmet());
app.use(helmet());
app.use(express.json());
app.use(cookieParser());



// Rate limiting (prevent brute force file hits)
app.use(
    rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 100,
        message: "Too many requests, try again later",
    })
);

app.get("/", (req, res) => {
    res.send("Hello World!");
});

app.post("/api/createOrder", createOrder);
app.post("/api/createPlan", createPlan);
app.post("/api/createSubscription", createSubscription);
app.get("/api/downloadInvoice/:file", downloadInvoice)
app.post("/api/login", [
    body("userName")
        .trim()
        .notEmpty()
        .withMessage("Username required")
        .isLength({ min: 3, max: 50 }),

    body("password")
        .notEmpty()
        .withMessage("Password required")
        .isLength({ min: 6 }),
], adminLogin);
app.get("/api/logout",adminLogout);

app.get("/api/payments",
    verifyAdmin,
    [
        query("page")
            .optional()
            .isInt({ min: 1 })
            .withMessage("Page must be positive integer"),

        query("limit")
            .optional()
            .isInt({ min: 1, max: 100 })
            .withMessage("Limit must be between 1 and 100"),

        query("filter")
            .optional()
            .isIn(["all", "this_month", "last_month"])
            .withMessage("Invalid filter"),
    ],
    getPayments
);

app.post("/api/razorpay-webhook",express.raw({ type: "application/json" }),handleRazorpayWebhook);
app.post("/api/signup", createAdmin);

app.post("/api/verifyOrder",
    [
        body("razorpay_order_id")
            .isString()
            .isLength({ min: 14 })
            .withMessage("Invalid order id"),

        body("razorpay_payment_id")
            .isString()
            .isLength({ min: 14 })
            .withMessage("Invalid payment id"),

        body("razorpaySignature")
            .isString()
            .isLength({ min: 20 })
            .withMessage("Invalid signature"),

        body("paymentId")
            .isInt()
            .withMessage("Invalid payment record id"),
    ],
    verifyPayment
);

app.post("/api/verifySubscription",
    [
        body("razorpay_payment_id")
            .isString()
            .isLength({ min: 14 })
            .withMessage("Invalid payment id"),

        body("razorpay_subscription_id")
            .isString()
            .isLength({ min: 14 })
            .withMessage("Invalid subscription id"),

        body("razorpay_signature")
            .isString()
            .isLength({ min: 20 })
            .withMessage("Invalid signature"),

        body("paymentId")
            .isInt()
            .withMessage("Invalid payment record id"),
    ],
    verifySubscription
);



app.use("/api/uploads", express.static(path.join(process.cwd(), "uploads")));

app.post(
    "/api/blog",
    verifyAdmin,
    upload.single("file"),
    createBlog
);

app.get("/api/blog", getBlogs);


app.get("/api/blog/:id", getSingleBlog);
app.delete("/api/blog/:id", verifyAdmin, deleteBlog);


export default app