import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
  getContentType,
} from '@whiskeysockets/baileys'
import { Sticker, StickerTypes } from 'wa-sticker-formatter'
import qrcode from 'qrcode-terminal'
import http from 'http'

// ============================================
//  SAGA BOT - Konfigurasi
// ============================================
const BOT_NAME = 'Saga Bot'
const PACK_NAME = 'Saga Bot Sticker'
const AUTHOR_NAME = 'Saga Bot'
const NOMOR_BOT = '6281528737834'

// ============================================
//  🔐 WHITELIST - Cuma nomor ini yang boleh pakai bot
//  Format: awali 62, tanpa +, tanpa 0, tanpa spasi
// ============================================
const WHITELIST = [
  '6281528737834', // <-- nomor kamu
]

// ============================================
//  Pesan Panduan
// ============================================
const PESAN_PANDUAN = `👋 *Halo! Selamat datang di ${BOT_NAME}* 🎉

Bot ini siap membantu kamu membuat stiker WhatsApp dengan 2 fitur keren:

🎨 *1. Buat Stiker Brat*
Ketik: */brat.Teks kamu*
Contoh: _/brat.Halo Dunia_

📸 *2. Buat Stiker dari Foto*
Kirim *foto* + caption: */sticker*

━━━━━━━━━━━━━━━━━━━
💡 Ketik */menu* untuk lihat panduan ini lagi.`

// ============================================
//  Web Server Kecil (Wajib untuk Railway)
// ============================================
const PORT = process.env.PORT || 7860
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end(`${BOT_NAME} is alive!`)
  })
  .listen(PORT, () => console.log(`✅ ${BOT_NAME} berjalan di port ${PORT}`))

// ============================================
//  Fungsi Utama Saga Bot
// ============================================
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Saga Bot', 'Chrome', '1.0.0'],
  })

  // --- Pairing Code (untuk 1 HP) ---
  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(NOMOR_BOT)
        console.log(`\n\n📱 ================================`)
        console.log(`📱 KODE PAIRING KAMU: ${code}`)
        console.log(`📱 ================================`)
        console.log(`\nMasukkan di WhatsApp → Perangkat Tertaut → Tautkan dengan nomor telepon\n`)
      } catch (e) {
        console.error('❌ Gagal minta pairing code:', e.message)
      }
    }, 5000)
  }

  // --- Koneksi ---
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`📱 QR Code:`)
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('❌ Koneksi terputus. Reconnect:', shouldReconnect)
      if (shouldReconnect) {
        setTimeout(() => startBot(), 3000)
      }
    } else if (connection === 'open') {
      console.log(`✅ ${BOT_NAME} sudah nyala dan siap dipakai!`)
    }
  })

  sock.ev.on('creds.update', saveCreds)

  // --- Handler Pesan Masuk ---
  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message) return

    const jid = msg.key.remoteJid
    if (!jid) return

    // 🛡️ BLOKIR GRUP TOTAL
    if (jid.endsWith('@g.us')) return

    // Ambil nomor pengirim
    const nomorPengirim = jid.split('@')[0].split(':')[0]

    // 🔐 CEK WHITELIST
    if (!WHITELIST.includes(nomorPengirim)) {
      console.log(`⛔ Diabaikan (bukan whitelist): ${nomorPengirim}`)
      return
    }

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ''

    // Deteksi command
    const isMenu = text.toLowerCase() === '/menu' || text.toLowerCase() === '/help'
    const isBrat = text.startsWith('/brat.')
    const isSticker = text.toLowerCase().includes('/sticker')

    // Kalau bukan command dan bukan gambar, diamkan
    const tipe = getContentType(msg.message)
    if (!isMenu && !isBrat && !isSticker) return

    // Kalau pesan dari bot sendiri (fromMe) dan bukan command, abaikan
    if (msg.key.fromMe && !isMenu && !isBrat && !isSticker) return

    // ========== COMMAND: /menu ==========
    if (isMenu) {
      await sock.sendMessage(jid, { text: PESAN_PANDUAN })
      return
    }

    // ========== COMMAND: /brat. ==========
    if (isBrat) {
      const isi = text.slice(6).trim()
      if (!isi) {
        await sock.sendMessage(jid, { text: `Contoh: /brat.Halo Semua` })
        return
      }

      try {
        const url = `https://api.lolhuman.xyz/api/brat?apikey=dannz&text=${encodeURIComponent(isi)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error('API Brat down')

        const buffer = Buffer.from(await res.arrayBuffer())
        const sticker = new Sticker(buffer, {
          pack: PACK_NAME,
          author: AUTHOR_NAME,
          type: StickerTypes.FULL,
          quality: 80,
        })
        await sock.sendMessage(jid, { sticker: await sticker.toBuffer() })
      } catch (e) {
        console.error('Error brat:', e.message)
        await sock.sendMessage(jid, { text: '❌ Gagal buat stiker Brat. Coba lagi.' })
      }
      return
    }

    // ========== COMMAND: /sticker ==========
    if (tipe === 'imageMessage') {
      const caption = msg.message.imageMessage?.caption || ''
      if (caption.toLowerCase().includes('/sticker')) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {})
          const sticker = new Sticker(buffer, {
            pack: PACK_NAME,
            author: AUTHOR_NAME,
            type: StickerTypes.FULL,
            quality: 80,
          })
          await sock.sendMessage(jid, { sticker: await sticker.toBuffer() })
        } catch (e) {
          console.error('Error sticker:', e.message)
          await sock.sendMessage(jid, { text: '❌ Gagal buat stiker.' })
        }
      }
    }
  })
}

// Jalankan bot
startBot()
