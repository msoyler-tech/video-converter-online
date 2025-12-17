const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();

if (process.env.FFMPEG_PATH) {
    ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const uploadsDir = path.join(__dirname, 'uploads');
const outputsDir = path.join(__dirname, 'outputs');
[uploadsDir, outputsDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
});

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
    limits: { fileSize: 50 * 1024 * 1024 }
});

// --- OTOMATİK TEMİZLEME FONKSİYONU ---
// Bu fonksiyon 30 dakikadan eski tüm dosyaları temizler
const cleanOldFiles = () => {
    const folders = [uploadsDir, outputsDir];
    const now = Date.now();
    const expirationTime = 30 * 60 * 1000; // 30 Dakika

    folders.forEach(folder => {
        fs.readdir(folder, (err, files) => {
            if (err) return;
            files.forEach(file => {
                const filePath = path.join(folder, file);
                fs.stat(filePath, (err, stats) => {
                    if (err) return;
                    if (now - stats.mtimeMs > expirationTime) {
                        fs.unlink(filePath, () => console.log(`🗑️ Eski dosya silindi: ${file}`));
                    }
                });
            });
        });
    });
};

// Her 15 dakikada bir temizlik kontrolü yap
setInterval(cleanOldFiles, 15 * 60 * 1000);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/upload', upload.single('video'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yüklenemedi' });
    res.json({ success: true, filename: req.file.filename });
});

app.post('/convert/mp4', (req, res) => {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'Dosya adı gerekli' });

    const inputPath = path.join(uploadsDir, filename);
    const outputFilename = filename.replace('.ts', '.mp4');
    const outputPath = path.join(outputsDir, outputFilename);

    ffmpeg(inputPath)
        .outputOptions(['-c:v libx264', '-preset ultrafast', '-threads 1', '-c:a aac', '-b:a 96k'])
        .output(outputPath)
        .on('end', () => {
            // Kaynak .ts dosyasını iş biter bitmez sil (Disk tasarrufu)
            fs.unlink(inputPath, () => console.log(`✅ Kaynak silindi: ${filename}`));
            res.json({ success: true, downloadUrl: `/download/${outputFilename}` });
        })
        .on('error', (err) => {
            console.error(err);
            res.status(500).json({ error: 'Hata oluştu' });
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
            // Dosya başarıyla indirildikten 5 saniye sonra sunucudan sil
            setTimeout(() => {
                fs.unlink(filePath, () => console.log(`🗑️ İndirilen dosya silindi: ${filename}`));
            }, 5000);
        }
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sunucu hazır. Port: ${PORT}`);
});