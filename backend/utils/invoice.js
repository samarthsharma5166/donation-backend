import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fs from "fs";
import path from "path";
function numberToWords(num) {
    const a = [
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
    ];
    const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    if (num === 0) return "Zero";

    const convert = (n) => {
        if (n < 20) return a[n];
        if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
        if (n < 1000)
            return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + convert(n % 100) : "");
        if (n < 100000)
            return convert(Math.floor(n / 1000)) + " Thousand" +
                (n % 1000 ? " " + convert(n % 1000) : "");
        if (n < 10000000)
            return convert(Math.floor(n / 100000)) + " Lakh" +
                (n % 100000 ? " " + convert(n % 100000) : "");
        return String(n);
    };

    return convert(num).trim() + " Only";
}



export async function generateInvoice(details) {
    const {
        donorName,
        donorEmail,
        donorAddress = "-",
        donorPAN = "-",
        amount,
        paymentId,
        date
    } = details;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const addPage = () => {
        const newPage = pdfDoc.addPage([595, 842]);
        return { page: newPage, y: 800 };
    };

    let { page, y } = addPage();
    const { width, height } = page.getSize();

    // === Load Images ===
    const logoPath = path.join(process.cwd(), "public", "Frame 7.png");
    const signaturePath = path.join(process.cwd(), "public", "signature.png");

    let logoImage, signatureImage;

    if (fs.existsSync(logoPath)) {
        const logoBytes = fs.readFileSync(logoPath);
        logoImage = await pdfDoc.embedPng(logoBytes);
    }

    if (fs.existsSync(signaturePath)) {
        const sigBytes = fs.readFileSync(signaturePath);
        signatureImage = await pdfDoc.embedPng(sigBytes);
    }

    // === HEADER BAR ===
    page.drawRectangle({
        x: 0,
        y: height - 120,
        width,
        height: 120,
        color: rgb(1, 1, 1),
    });

    if (logoImage) {
        const logoW = 100;
        const logoH = (logoImage.height / logoImage.width) * logoW;
        page.drawImage(logoImage, {
            x: 40,
            y: height - logoH - 25,
            width: logoW,
            height: logoH,
        });
    }

    page.drawText("MADHAVAM FOUNDATION", {
        x: 160,
        y: height - 60,
        size: 22,
        font: boldFont,
        color: rgb(0, 0, 0),
    });

    page.drawText("Registered NGO - Spreading Compassion & Service", {
        x: 160,
        y: height - 85,
        size: 12,
        font,
        color: rgb(0, 0, 0),
    });

    // === BODY ===
    y = height - 150;

    const drawLine = (x1, y1, x2, y2) =>
        page.drawLine({
            start: { x: x1, y: y1 },
            end: { x: x2, y: y2 },
            thickness: 0.5,
            color: rgb(0.7, 0.7, 0.7),
        });

    page.drawText("Donation Receipt (80G Certificate)", {
        x: 50,
        y,
        size: 16,
        font: boldFont,
    });

    y -= 30;
    drawLine(45, y + 10, width - 45, y + 10);

    const textBlock = (label, value, offset = 0) => {
        page.drawText(label, { x: 50, y, size: 12, font: boldFont });
        page.drawText(value, { x: 200, y, size: 12, font });
        y -= 20 + offset;
    };

    y -= 20;

    textBlock("Receipt No:", paymentId);
    textBlock("Date:", new Date(date).toLocaleDateString("en-IN"));
    textBlock("Donor Name:", donorName);
    textBlock("Address:", donorAddress);
    textBlock("PAN No:", donorPAN);
    textBlock("Email:", donorEmail);
    textBlock(
        "Amount Donated:",
        `Rs. ${amount.toLocaleString("en-IN")} (${numberToWords(amount)})`
    );
    textBlock("Payment Mode:", "Digital");

    y -= 10;
    drawLine(45, y + 5, width - 45, y + 5);

    y -= 30;

    page.drawText(`Dear ${donorName},`, { x: 50, y, size: 12, font });
    y -= 18;

    page.drawText(
        `Thank you for your generous contribution to Madhavam Foundation.`,
        { x: 50, y, size: 12, font }
    );
    y -= 15;

    page.drawText(
        `Your donation supports our mission to bring compassion and service to communities in need.`,
        { x: 50, y, size: 12, font }
    );

    // === Signature Section ===
    y -= 60;

    page.drawText("For Madhavam Foundation", { x: 50, y, size: 12, font });

    if (signatureImage) {
        const sigW = 120;
        const sigH = (signatureImage.height / signatureImage.width) * sigW;
        page.drawImage(signatureImage, {
            x: 60,
            y: y - sigH - 5,
            width: sigW,
            height: sigH,
        });
        y -= sigH + 10;
    } else {
        y -= 40;
    }

    page.drawText("(Authorised Signatory)", { x: 50, y, size: 12, font });

    // === Legal Section ===
    y -= 60;
    if (y < 150) ({ page, y } = addPage());

    page.drawText("Legal & Tax Information:", {
        x: 50,
        y,
        size: 14,
        font: boldFont,
    });

    y -= 20;

    const lines = [
        "Donations qualify for deduction U/s 80G(5) of Income Tax Act 1961.",
        "Unique Registration No.: AAJTM1200BF20251 (provisionally approved on July 18, 2025).",
        "Valid up to AY 2026-27. IT PAN: AAJTM1200B | 12AA: AAJTM1200BE20251",
        "DARPAN ID: UP/2024/0417365.",
        "This receipt invalid if donation is refunded.",
        "Form 10BE will be issued for income-tax deduction claim.",
    ];

    for (const line of lines) {
        page.drawText(line, { x: 50, y, size: 11, font });
        y -= 15;
    }

    // === Footer ===
    y -= 30;
    drawLine(45, y + 10, width - 45, y + 10);
    y -= 20;

    page.drawText(
        "This is a computer-generated receipt. For queries email:",
        { x: 50, y, size: 10, font }
    );

    y -= 15;

    page.drawText(
        "madhavamfoundation99@gmail.com | https://www.madhavamfoundation.com",
        { x: 50, y, size: 10, font, color: rgb(0.1, 0.3, 0.7) }
    );

    y -= 15;

    page.drawText(
        "Shree Vidhya Peeth, Sanskrit Chatravvas, Shyam Kuti, Chetra Prikrima Marg Vrindavan, Mathura UP 281121",
        { x: 50, y, size: 10, font, color: rgb(0.3, 0.3, 0.3) }
    );

    // === SAVE ===
    const pdfBytes = await pdfDoc.save();

    const invoicesDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(invoicesDir)) {
        fs.mkdirSync(invoicesDir, { recursive: true });
    }

    const filePath = path.join(invoicesDir, `${paymentId}.pdf`);
    fs.writeFileSync(filePath, pdfBytes);

    const fileName = `${paymentId}.pdf`;
    // const filePath = path.join(invoicesDir, fileName);

    fs.writeFileSync(filePath, pdfBytes);

    return {
        fileName,
        filePath
    };

    // return `${paymentId}.pdf`;
}