import { validationResult } from "express-validator";
import bcrypt from "bcrypt";
import {prisma} from "../db/db.js";

export const createAdmin = async (req, res) => {
    try {
        // 1️⃣ Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array(),
            });
        }

        const { name, userName, password } = req.body;

        // 2️⃣ Check duplicate username
        const existingUser = await prisma.admin.findUnique({
            where: { userName },
        });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Username already exists",
            });
        }

        // 3️⃣ Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // 4️⃣ Create admin with forced role = ADMIN
        await prisma.admin.create({
            data: {
                name,
                userName,
                password: hashedPassword, 
            },
        });

        return res.status(201).json({
            success: true,
            message: "Admin created successfully",
        });

    } catch (error) {
        console.error("Admin creation error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};