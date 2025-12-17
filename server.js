const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Render üzerinde FFMPEG yolunu tanımla
if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Klasörlerin kontrolü ve oluşturulması
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
[uploadsDir, outputsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Dosya yükleme (Multer) ayarları
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueName + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (path.extname(file.originalname).toLowerCase() === '.ts') {
            cb(null, true);
        } else {
            cb(new Error('Sadece .ts dosyaları kabul edilir!'));
        }
    },
    limits: { fileSize: 50 * 1024 * 1024 } // Ücretsiz plan için 50MB limit
});

// --- PERİYODİK TEMİZLEME FONKSİYONU ---
const cleanOldFiles = () => {
    const folders = [uploadsDir, outputsDir];
    const now = Date.now();
    const expirationTime = 30 * 60 * 1000; // 30 Dakikadan eski dosyalar

    folders.forEach(folder => {
        fs.readdir(folder, (err, files) => {
            if (err) return;
            files.forEach(file => {
                const filePath = path.join(folder, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (now - stats.mtimeMs > expirationTime) {
                        fs.unlink(filePath, () => console.log(`🗑️ Zaman aşımına uğrayan dosya silindi: ${file}`));
                    }
                });
            });
        });
    });
};
setInterval(cleanOldFiles, 15 * 60 * 1000); // 15 dakikada bir çalışır

// ANA SAYFA
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// DOSYA YÜKLEME ROTASI
app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yüklenemedi' });
    res.json({ success: true, filename: req.file.filename });
});

// MP4 DÖNÜŞTÜRME ROTASI (Sadece MP4 Desteklenir)
app.post('/convert/mp4', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Dosya adı gerekli' });

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = filename.replace('.ts', '.mp4');
    const outputPath = path.join(outputsDir, outputFilename);

    ffmpeg(inputPath)
        .outputOptions([
            '-c:v libx264',
            '-preset ultrafast', // CPU tasarrufu
            '-threads 1',        // RAM tasarrufu
            '-c:a aac',
            '-b:a 96k'
        ])
        .output(outputPath)
        .on('start', () => console.log(`🎬 İşlem başladı: ${filename}`))
        .on('end', () => {
            // Dönüştürme bitince orijinal .ts dosyasını hemen sil
            fs.unlink(inputPath, () => console.log(`✅ Kaynak dosya temizlendi: ${filename}`));
            res.json({ success: true, downloadUrl: `/download/${outputFilename}`, filename: outputFilename });
        })
        .on('error', (err) => {
            console.error('FFmpeg Hatası:', err);
            res.status(500).json({ error: 'Dönüştürme sırasında bir hata oluştu.' });
        })
        .run();
});

// İNDİRME VE SONRASINDA SİLME
app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(outputsDir, filename);

    if (!fs.existsSync(filePath)) return res.status(404).send('Dosya bulunamadı.');

    res.download(filePath, (err) => {
        if (!err) {
            // Kullanıcı dosyayı indirdikten 10 saniye sonra MP4'ü sil
            setTimeout(() => {
                fs.unlink(filePath, () => console.log(`🗑️ İndirilen dosya sunucudan temizlendi: ${filename}`));
            }, 10000);
        }
    });
});

// SUNUCUYU BAŞLAT
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
    ======================================
    🚀 MP4 CONVERTER SERVER ACTIVE
    📍 Port: ${PORT}
    ======================================
    `);
});