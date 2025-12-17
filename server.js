const uploadForm = document.getElementById('uploadForm');
const videoInput = document.getElementById('videoInput');
const convertMp4Btn = document.getElementById('convertMp4');
const convertYuvBtn = document.getElementById('convertYuv');
const statusDiv = document.getElementById('status');
const downloadLink = document.getElementById('downloadLink');

let currentFilename = '';

uploadForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData();
    formData.append('video', videoInput.files[0]);

    statusDiv.innerText = '📤 Yükleniyor...';

    try {
        const res = await fetch('/upload', { method: 'POST', body: formData });
        const data = await res.json();
        
        if (data.success) {
            currentFilename = data.filename;
            statusDiv.innerText = '✅ Yüklendi! Şimdi format seçin.';
            convertMp4Btn.disabled = false;
            convertYuvBtn.disabled = false;
        } else {
            statusDiv.innerText = '❌ Yükleme hatası: ' + (data.error || 'Bilinmiyor');
        }
    } catch (err) {
        statusDiv.innerText = '❌ Sunucuya bağlanılamadı.';
    }
};

async function convertVideo(format) {
    statusDiv.innerText = `⚙️ ${format.toUpperCase()} formatına dönüştürülüyor... Bu işlem birkaç dakika sürebilir.`;
    convertMp4Btn.disabled = true;
    convertYuvBtn.disabled = true;

    try {
        const res = await fetch(`/convert/${format}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: currentFilename })
        });

        // Hata ayıklama için: Eğer cevap JSON değilse HTML hatasını yakala
        const contentType = res.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const textHata = await res.text();
            console.error("Sunucu hatası:", textHata);
            throw new Error("Sunucu JSON yerine HTML döndürdü. Muhtemelen sunucu resetlendi veya yol bulunamadı.");
        }

        const data = await res.json();
        if (data.success) {
            statusDiv.innerText = '🎉 Başarıyla dönüştürüldü!';
            downloadLink.href = data.downloadUrl;
            downloadLink.style.display = 'block';
            downloadLink.innerText = '📥 Dönüştürülen Videoyu İndir';
        } else {
            statusDiv.innerText = '❌ Dönüştürme hatası: ' + data.error;
        }
    } catch (err) {
        statusDiv.innerText = '❌ Hata: ' + err.message;
        console.error(err);
    }
}

convertMp4Btn.onclick = () => convertVideo('mp4');
convertYuvBtn.onclick = () => convertVideo('yuv');