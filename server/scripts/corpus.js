/**
 * corpus.js - Korpus teks uji 5 domain x 3 panjang token (desain Levy).
 *
 * Tiap domain punya kumpulan kalimat fakta yang DISTINGTIF. Teks dibentuk
 * dengan mengambil sejumlah kalimat sampai mendekati target token:
 *   short  ~ 250 token, medium ~ 1000 token, long ~ 3000 token.
 * Estimasi token: ~1.3 token per kata (heuristik).
 *
 * Penamaan mengikuti tabel Levy:
 *   Sains     T1(250) T2(1000) T3(3000)
 *   Humaniora T4      T5       T6
 *   Ekonomi   T7      T8       T9
 *   Kesehatan T10     T11      T12
 *   Hukum     T13     T14      T15
 */

const DOMAINS = {
  'Sains dan Teknologi': [
    'Machine learning adalah cabang kecerdasan buatan yang mempelajari algoritma yang belajar dari data.',
    'Supervised learning menggunakan data berlabel untuk tugas klasifikasi dan regresi.',
    'Unsupervised learning menemukan pola tersembunyi melalui clustering seperti K-Means dan DBSCAN.',
    'Reinforcement learning melatih agen melalui sinyal reward pada lingkungan dinamis.',
    'Random forest dan gradient boosting adalah model ensemble berbasis decision tree.',
    'Jaringan saraf tiruan terdiri atas lapisan input, lapisan tersembunyi, dan lapisan output.',
    'Convolutional neural network banyak dipakai untuk pengolahan citra dan visi komputer.',
    'Recurrent neural network dan transformer cocok untuk data berurutan seperti teks.',
    'Preprocessing data mencakup imputasi nilai hilang, normalisasi, dan rekayasa fitur.',
    'Model dilatih pada klaster GPU memakai framework PyTorch atau TensorFlow.',
    'Evaluasi performa memakai metrik akurasi, presisi, recall, F1, dan RMSE.',
    'Overfitting diatasi dengan regularisasi, dropout, dan validasi silang.',
    'Transfer learning memanfaatkan model terlatih untuk tugas baru dengan data terbatas.',
    'Deployment model dilakukan melalui API, kontainerisasi Docker, dan pemantauan drift.',
  ],
  'Humaniora dan Sosial': [
    'Urbanisasi di Indonesia menunjukkan pergeseran demografi sejak era reformasi.',
    'Penduduk desa bermigrasi ke kota untuk mencari peluang ekonomi yang lebih baik.',
    'Kota besar menghadapi masalah kepadatan penduduk, kemacetan, dan polusi.',
    'Munculnya kawasan kumuh menjadi tantangan sosial yang serius bagi pemerintah kota.',
    'Pemerintah merespons dengan program perumahan rakyat dan kota satelit.',
    'Kebijakan desentralisasi mendorong pemerataan pembangunan ke daerah.',
    'Faktor budaya dan jaringan sosial keluarga memengaruhi pola migrasi.',
    'Modal sosial berperan dalam adaptasi pendatang di lingkungan perkotaan.',
    'Transformasi sosial menggeser nilai komunal menjadi lebih individualistis.',
    'Pendidikan dan akses informasi mempercepat mobilitas sosial vertikal.',
    'Globalisasi budaya membawa akulturasi sekaligus tantangan identitas lokal.',
    'Media sosial mengubah cara masyarakat berinteraksi dan berpartisipasi politik.',
    'Ketimpangan kota dan desa memunculkan kebutuhan kebijakan inklusif.',
    'Sejarah kolonial turut membentuk struktur ruang kota di Indonesia.',
  ],
  'Bisnis dan Ekonomi': [
    'Pemasaran digital menjadi pilar penting bagi UMKM di era pasca-pandemi.',
    'Media sosial seperti Instagram, TikTok, dan Facebook memperluas jangkauan pasar.',
    'Influencer marketing menjadi tren dengan tingkat konversi penjualan yang tinggi.',
    'SEO dan content marketing membantu visibilitas organik di mesin pencari.',
    'Email marketing dengan personalisasi meningkatkan retensi pelanggan.',
    'Google Analytics dan Meta Insights dipakai untuk evaluasi kampanye.',
    'ROAS dan customer acquisition cost menjadi indikator keberhasilan strategi.',
    'Segmentasi pasar memungkinkan penargetan audiens yang lebih presisi.',
    'Funnel pemasaran mencakup tahap awareness, consideration, dan conversion.',
    'Strategi omnichannel menyatukan pengalaman daring dan luring pelanggan.',
    'Loyalitas merek dibangun melalui konsistensi nilai dan kualitas layanan.',
    'Analisis kompetitor membantu menentukan diferensiasi produk.',
    'Manajemen rantai pasok memengaruhi efisiensi biaya dan kecepatan pengiriman.',
    'Inovasi model bisnis berbasis langganan meningkatkan pendapatan berulang.',
  ],
  'Kesehatan dan Kedokteran': [
    'Diabetes melitus tipe 2 adalah penyakit metabolik kronis dengan resistensi insulin.',
    'Faktor risiko meliputi obesitas, pola makan tinggi gula, dan kurang aktivitas fisik.',
    'Gejala umum mencakup polidipsia, poliuria, dan polifagia.',
    'Diagnosis ditegakkan melalui pemeriksaan gula darah puasa dan HbA1c.',
    'Pengelolaan jangka panjang membutuhkan modifikasi gaya hidup dan farmakoterapi.',
    'Komplikasi serius meliputi nefropati, retinopati, dan neuropati diabetik.',
    'Edukasi pasien tentang pemantauan gula darah mandiri sangat penting.',
    'Metformin menjadi terapi lini pertama untuk mengontrol glukosa darah.',
    'Diet seimbang dan olahraga teratur memperbaiki sensitivitas insulin.',
    'Pemeriksaan rutin mencegah perburukan menjadi komplikasi kardiovaskular.',
    'Hipertensi sering menyertai diabetes dan memperberat risiko stroke.',
    'Dukungan psikologis membantu kepatuhan pasien terhadap pengobatan.',
    'Skrining dini pada populasi berisiko menurunkan beban penyakit.',
    'Teknologi continuous glucose monitoring memperbaiki kontrol glikemik.',
  ],
  'Hukum dan Kebijakan': [
    'Undang-Undang Perlindungan Data Pribadi disahkan pada 2022 untuk melindungi privasi.',
    'Regulasi mengatur kewajiban pengendali dan pemroses data dalam pengolahan data.',
    'Hak subjek data mencakup akses, koreksi, penghapusan, dan portabilitas data.',
    'Sanksi administratif berupa denda dapat dikenakan atas pelanggaran.',
    'Lembaga independen dibentuk untuk pengawasan dan penegakan undang-undang.',
    'Sosialisasi dilakukan kepada korporasi, lembaga publik, dan masyarakat umum.',
    'Pelanggaran berat seperti kebocoran data dapat dipidana penjara.',
    'Prinsip pemrosesan data meliputi keabsahan, keadilan, dan transparansi.',
    'Persetujuan eksplisit menjadi dasar pemrosesan data pribadi yang sah.',
    'Transfer data lintas negara harus memenuhi standar perlindungan yang setara.',
    'Asas akuntabilitas mewajibkan organisasi mendokumentasikan kepatuhannya.',
    'Penilaian dampak perlindungan data diperlukan untuk pemrosesan berisiko tinggi.',
    'Pejabat pelindungan data ditunjuk untuk mengawasi kepatuhan internal.',
    'Harmonisasi regulasi mendukung kepercayaan dalam ekonomi digital.',
  ],
};

const ID = {
  'Sains dan Teknologi':       ['T1', 'T2', 'T3'],
  'Humaniora dan Sosial':      ['T4', 'T5', 'T6'],
  'Bisnis dan Ekonomi':        ['T7', 'T8', 'T9'],
  'Kesehatan dan Kedokteran':  ['T10', 'T11', 'T12'],
  'Hukum dan Kebijakan':       ['T13', 'T14', 'T15'],
};

const TOKEN_TARGET = { short: 250, medium: 1000, long: 3000 };
const estTokens = (text) => Math.round(text.trim().split(/\s+/).filter(Boolean).length * 1.3);

/** Bangun teks hingga mendekati target token dengan mengulang pool kalimat distingtif. */
function buildText(sentences, targetTokens) {
  const out = [];
  let i = 0;
  while (estTokens(out.join(' ')) < targetTokens) {
    out.push(sentences[i % sentences.length]);
    i += 1;
    if (i > 400) break;
  }
  return out.join(' ');
}

/** Korpus stabilitas: 5 domain, 1 teks MEDIUM (~1000 token) per domain. */
export function stabilityCorpus() {
  return Object.entries(DOMAINS).map(([domain, sents]) => ({
    id: ID[domain][1], domain,
    text: buildText(sents, TOKEN_TARGET.medium),
    tokens: estTokens(buildText(sents, TOKEN_TARGET.medium)),
  }));
}

/** Korpus visualisasi: 5 domain x 3 panjang (250/1000/3000 token) = 15 teks. */
export function layoutCorpus() {
  const cats = [['short', 0], ['medium', 1], ['long', 2]];
  const out = [];
  for (const [domain, sents] of Object.entries(DOMAINS)) {
    for (const [cat, idx] of cats) {
      const text = buildText(sents, TOKEN_TARGET[cat]);
      out.push({ id: ID[domain][idx], domain, lenCat: cat, targetTokens: TOKEN_TARGET[cat], tokens: estTokens(text), text });
    }
  }
  return out;
}

export { TOKEN_TARGET, estTokens };
