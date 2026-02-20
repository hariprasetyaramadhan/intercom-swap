<<<<<<< HEAD

track addres :trac1r5gp5f9duqltttg8xgen6vcjwex5fdsuq0ugvl59pu5v6w67ezuq5hdmzj



# 🔄 Intercom Swap Bot

Bot otomatisasi untuk melakukan swap token di ekosistem Intercom. Bot ini dibangun menggunakan Node.js dan mendukung interaksi blockchain berkecepatan tinggi.
=======
# Intercom Monitor Bot

Bot Python sederhana untuk monitoring saldo wallet secara real-time di jaringan Intercom melalui Termux.

## Fitur
* Ringan & Cepat (tanpa library berat).
* Auto-update saldo setiap 10 detik.
* Mudah dikonfigurasi.

## Cara Install
1. `pkg install python`
2. `pip install requests`
3. `git clone https://github.com/username-mu/intercom-swap`
4. `python bot.py`
>>>>>>> ba92969 (Update wallet address and documentation)

## 📋 Prasyarat Sistem

Sebelum menjalankan bot, pastikan perangkat kamu memiliki library native berikut (terutama jika menggunakan Termux/Linux):

* **Node.js**: v18 atau yang lebih baru.
* **Build Tools**: `gcc`, `g++`, `make`.
* **Native Libraries**: `libsodium`, `rocksdb`.

## ⚙️ Instalasi

1. **Clone Repository:**
   ```bash
   git clone [https://github.com/hariprasetyaramadhan/intercom-swap.git](https://github.com/hariprasetyaramadhan/intercom-swap.git)
   cd intercom-swap

Instal Dependensi Sistem (Khusus Termux):
Jika kamu menjalankan ini di Termux, jalankan perintah ini terlebih dahulu untuk menghindari error MODULE_NOT_FOUNpkg 

install build-essential libsodium rocksdb tur-repo -y


   Instal Node Modules: npm install


Isi file konfigurasi atau .env dengan Private Key dan RPC URL kamu.

   node index.js
   

   Troubleshooting (Error RocksDB/Sodium)
Jika kamu menemui error terkait modul native saat menjalankan node index.js, lakukan kompilasi ulang manual:

   npm install rocksdb sodium-native --build-from-source

   
 
