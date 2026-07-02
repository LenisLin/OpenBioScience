<h1 align="center">OpenScience</h1>

<p align="center">
  <strong>Kanıta dayalı, titiz bilim için açık kaynaklı bir AI araştırma çalışma alanı.</strong>
</p>

<p align="center">
  OpenScience, yerel bir araştırma projesini kaynak okuyabilen, kanıt arayabilen, analiz çalıştırabilen, dosya önizleyebilen, figürleri revize edebilen, makale yazabilen ve incelenebilir bir kaynak izi bırakan çalışma alanına dönüştürür.
</p>

<p align="center">
  <img src="../../resources/readme/website-openscience-hero.png" alt="OpenScience research workspace overview" width="100%" />
</p>

<p align="center">
  <a href="../../readme.md">English</a> · <a href="./readme_ch.md">简体中文</a> · <a href="./readme_tw.md">繁體中文</a> · <a href="./readme_jp.md">日本語</a> · <a href="./readme_ko.md">한국어</a> · <a href="./readme_es.md">Español</a> · <a href="./readme_pt.md">Português</a> · <strong>Türkçe</strong> · <a href="./readme_ru.md">Русский</a> · <a href="./readme_uk.md">Українська</a>
</p>

---

## Ana çizgi

OpenScience, Claude Science'ın gösterdiği temel fikirden öğrenir: bilimsel AI yalnızca bir sohbet kutusu değil, projeleri düzenleyen, analiz çalıştıran, kanıt arayan, bilimsel artifact'leri saklayan, dosyaları önizleyen ve hesaplama ile inceleme kaydını tutan bir araştırma ortamı olmalıdır.

| Araştırma sorusu | OpenScience yanıtı |
|---|---|
| Çalışma nerede yaşar | Yalnızca konuşmada değil, araştırma projesi klasöründe |
| Gerçek analiz çalıştırabilir mi | Evet, Python, R, shell, notebook ve yerel coding agent ile |
| Sonuç sonradan incelenebilir mi | Evet, figürler, tablolar, notebook'lar, raporlar ve yazılar kaynak izi içeren artifact olarak açılır |
| Tıbbi kanıt nasıl ele alınır | Medical Evidence Mode, kanıt gücü, çatışmalar ve sınırlamalar içeren rapor üretir |
| Mevcut araçlar kullanılabilir mi | Evet, yerel dosyalar, mevcut scriptler, model sağlayıcıları ve coding agent akışları |

---

## Ürün turu

<table>
<tr>
<td width="50%" valign="top">
<img src="../../resources/readme/science-output-workspace.png" alt="OpenScience artifact preview" /><br/>
<sub><b>Artifact preview.</b> Normal önizleme paneli, dosyanın yanında kaynak, kod, log ve inceleme durumunu gösteren bilimsel görünüme dönüşür.</sub>
</td>
<td width="50%" valign="top">
<img src="../../resources/readme/medical-evidence-report.png" alt="OpenScience medical evidence report" /><br/>
<sub><b>Medical Evidence Mode.</b> Klinik ve biyomedikal sorular kaynak, kanıt gücü, çatışmalar ve sonuç içeren raporlara dönüşür.</sub>
</td>
</tr>
</table>

---

## Araştırma akışı

| Adım | Araştırmacı ne yapar | OpenScience neyi tutar |
|---:|---|---|
| 1 | Proje oluşturur veya açar | Klasör, ayarlar, kaynaklar, çıktılar |
| 2 | Doğal dille soru sorar | Görev, varsayımlar, dosyalar, açıklamalar |
| 3 | Kanıt arar ve okur | Makale, çalışma, belge, veri, figür veya kod çalıştırma etiketleri |
| 4 | Analiz çalıştırır | Scriptler, komutlar, notebook'lar, girdiler, loglar, ortam |
| 5 | Artifact'leri inceler | Figürler, tablolar, raporlar, yazılar, kaynak izi, inceleme |
| 6 | Revize eder ve dışa aktarır | Sürümler, yorumlar, PDF, Word, LaTeX, notebook |

---

## Kanıt kapsamı

| Kanıt | Kullanım |
|---|---|
| 11M+ papers | Literatür taraması, yöntem karşılaştırması, atıflı yazım |
| 225K+ ilaç ve cihaz belgesi | Etiket, kılavuz, düzenleyici bağlam, güvenlik |
| 1M+ klinik çalışma | Müdahale, sonuç, durum, karşılaştırıcı, uygunluk |
| 150M+ abstracts | Literatürü hızlı keşfetme |
| Yerel dosyalar ve çıktılar | Veri, kod, figür, notebook, rapor, log |

---

## Hızlı başlangıç

```bash
git clone https://github.com/ResearAI/OpenScience.git
cd OpenScience
bun install
bun run dev
```

Tam İngilizce README: [readme.md](../../readme.md).

---

## Lisans ve teşekkürler

OpenScience, başlangıçta Apache-2.0 lisansı ile yayınlanan [AionUi](https://github.com/iOfficeAI/AionUi) üzerine kurulmuş değiştirilmiş bir çalışmadır.

Bu OpenScience fork/dağıtımından itibaren proje [AGPL-3.0-only](../../LICENSE) altında yayınlanır; kendi lisans bildirimi olan üçüncü taraf bileşenler ve dosyalar kendi lisanslarına tabidir. Orijinal Apache-2.0 telif, lisans ve atıf bildirimleri [LICENSES/Apache-2.0.txt](../../LICENSES/Apache-2.0.txt), [NOTICE](../../NOTICE) ve [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md) içinde korunur.
