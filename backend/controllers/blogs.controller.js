import {prisma} from "../db/db.js";
import path from "path";
import fs from "fs";


// ---------------- CREATE BLOG ----------------
export const createBlog = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No file uploaded",
            });
        }

        const { title, description } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                success: false,
                message: "Title and description are required",
            });
        }

        const blog = await prisma.blog.create({
            data: {
                title,
                body: description,
                coverImage: req.file.filename,
                authorId: Number(req.user.userId),
            },
        });

        return res.status(201).json({
            success: true,
            message: "Blog created successfully",
            blog,
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Something went wrong",
        });
    }
};


// ---------------- GET BLOGS ----------------
export const getBlogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        if (page < 1 || limit < 1 || limit > 50) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values",
            });
        }

        const offset = (page - 1) * limit;

        const [blogs, totalBlogs] = await Promise.all([
            prisma.blog.findMany({
                skip: offset,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    author: {
                        select: { userName: true },
                    },
                },
            }),
            prisma.blog.count(),
        ]);

        return res.status(200).json({
            success: true,
            message: "Blogs fetched successfully",
            blogs,
            pageInfo: {
                currentPage: page,
                perPage: limit,
                totalBlogs,
                totalPages: Math.ceil(totalBlogs / limit),
            },
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Something went wrong",
        });
    }
};


const UPLOAD_DIR = path.join(process.cwd(), "uploads");


// ---------------- GET SINGLE BLOG ----------------
export const getSingleBlog = async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Valid blog id is required",
            });
        }

        const blog = await prisma.blog.findUnique({
            where: { id },
            include: {
                author: {
                    select: { userName: true },
                },
            },
        });

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: blog,
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
        });
    }
};



// ---------------- DELETE BLOG ----------------
export const deleteBlog = async (req, res) => {
    try {
        const id = Number(req.params.id);

        if (!id || isNaN(id)) {
            return res.status(400).json({
                success: false,
                message: "Valid blog id is required",
            });
        }

        const blog = await prisma.blog.findUnique({
            where: { id },
        });

        if (!blog) {
            return res.status(404).json({
                success: false,
                message: "Blog not found",
            });
        }

        // Optional: ownership check
        if (req.user.role !== "ADMIN" && blog.authorId !== Number(req.user.userId)) {
            return res.status(403).json({
                success: false,
                message: "Forbidden",
            });
        }

        await prisma.blog.delete({
            where: { id },
        });

        // Delete associated image file safely
        if (blog.coverImage) {
            const imagePath = path.join(UPLOAD_DIR, blog.coverImage);

            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }

        return res.status(200).json({
            success: true,
            message: "Blog deleted successfully",
        });

    } catch (err) {
        console.error(err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong",
        });
    }
};