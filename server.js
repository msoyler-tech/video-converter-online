const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

// Render için FFMPEG yolu ayarı (Environment Variable yoksa varsayılanı kullanır)
if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Klasörlerin oluşturulması
const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
[uploadsDir, outputsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

// Dosya yükleme ayarları
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
    limits: { fileSize: 50 * 1024 * 1024 } // Ücretsiz plan için limit 50MB'a çekildi
});

// Rotalar
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Dosya yüklenemedi' });
    }
    res.json({
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
    });
});

app.post('/convert/mp4', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Dosya adı gerekli' });

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = filename.replace('.ts', '.mp4');
    const outputPath = path.join(outputsDir, outputFilename);

    ffmpeg(inputPath)
        // Bellek (RAM) ve CPU kullanımını düşüren kritik ayarlar:
        .outputOptions([
            '-c:v libx264',
            '-preset ultrafast', // En hızlı ve en az RAM tüketen mod
            '-crf 28',           // Kaliteyi bir miktar düşürerek işlem yükünü azaltır
            '-threads 1',        // Tek çekirdek kullanarak RAM patlamasını engeller
            '-c:a aac',
            '-b:a 96k'           // Ses kalitesini optimize eder
        ])
        .output(outputPath)
        .on('start', () => console.log('MP4 dönüştürme başladı (Hafif mod)...'))
        .on('end', () => {
            console.log('MP4 dönüştürme tamamlandı');
            res.json({ success: true, downloadUrl: `/download/${outputFilename}`, filename: outputFilename });
        })
        .on('error', (err) => {
            console.error('MP4 Hata:', err);
            res.status(500).json({ error: 'Dönüştürme hatası' });
        })
        .run();
});

app.post('/convert/yuv', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Dosya adı gerekli' });

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = filename.replace('.ts', '.yuv');
    const outputPath = path.join(outputsDir, outputFilename);

    ffmpeg(inputPath)
        .outputOptions(['-f rawvideo', '-pix_fmt yuv420p', '-threads 1'])
        .output(outputPath)
        .on('start', () => console.log('YUV dönüştürme başladı...'))
        .on('end', () => {
            console.log('YUV dönüştürme tamamlandı');
            res.json({ success: true, downloadUrl: `/download/${outputFilename}`, filename: outputFilename });
        })
        .on('error', (err) => {
            console.error('YUV Hata:', err);
            res.status(500).json({ error: 'Dönüştürme hatası' });
        })
        .run();
});

app.get('/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(outputsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Dosya bulunamadı' });
    res.download(filePath);
});

app.delete('/cleanup/:filename', (req, res) => {
    const filename = req.params.filename;
    const uploadPath = path.join(uploadsDir, filename);
    try {
        if (fs.existsSync(uploadPath)) fs.unlinkSync(uploadPath);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Silme hatası' });
    }
});

// Sunucuyu Başlatma
app.listen(PORT, '0.0.0.0', () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 VIDEO CONVERTER BULUT SUNUCUSU HAZIR');
    console.log('='.repeat(50));
    console.log(`📍 Port: ${PORT}`);
    console.log('='.repeat(50) + '\n');
});