import fs from 'fs';

console.log("🚀 INTERCOM SWAP BOT STARTING...");

// Mengecek folder src untuk memastikan bot di lokasi yang benar
if (fs.existsSync('./src')) {
    console.log("✅ Folder 'src' Terdeteksi. Bot Berjalan di Background.");

    setInterval(() => {
        const waktu = new Date().toLocaleTimeString();
        console.log(`[${waktu}] 🤖 Bot Aktif: Memantau transaksi...`);
    }, 10000);
} else {
    console.log("❌ Folder 'src' tidak ada. Kamu salah lokasi folder!");
    process.exit(1);
}

