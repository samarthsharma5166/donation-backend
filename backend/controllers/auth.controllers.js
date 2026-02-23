import { validationResult } from "express-validator";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import {prisma} from "../db/db.js";

export const adminLogin = async (req, res) => {
    try {
        // 1️⃣ Validate input first
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const { userName, password } = req.body;

        // 2️⃣ Check user existence
        const user = await prisma.admin.findFirst({
            where: { userName },
        });

        if (!user) {
            // Generic message to prevent username enumeration
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        // 3️⃣ Compare password securely
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: "Invalid credentials",
            });
        }

        // 4️⃣ Create JWT with expiration
        const token = jwt.sign(
            {
                userId: user.id,
                role: user.role,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h",
                issuer: "your-app-name",
            }
        );

        // 5️⃣ Secure cookie
        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 60 * 60 * 1000, // 1 hour
            path: "/",
        });

        return res.status(200).json({
            success: true,
            message: "Login successful",
        });

    } catch (error) {
        console.error("Login error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};

export const adminLogout = async (req, res) => {
    try {
        // Clear cookie securely
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
        });

        return res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });

    } catch (error) {
        console.error("Logout error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};