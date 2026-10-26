# Visulaserz büyüme rehberi: senin yapacakların

Sitenin teknik SEO tarafı ve sayfaları hazır (aşağıda "Sitede neler var"). Buradaki adımlar senin hesaplarınla yapılacak işler: arama motorlarına siteyi tanıtmak, ilk tanıtım paylaşımları ve kısa video planı. Ben senin adına bir yere giriş yapamam ya da paylaşım yapamam; metinleri kopyalayıp kendin kullanabilirsin.

Sıra önemli: önce 1 ve 2 (arama motorları, bugün), sonra 4 (paylaşımlar, sayfalar Google'a girmeye başladıktan sonra, yaklaşık bir hafta içinde).

---

## 1. Google Search Console (yaklaşık 15 dakika)

1. https://search.google.com/search-console adresine git, Google hesabınla gir.
2. **Mülk ekle** → **Alan adı** (Domain) → `visulaserz.com` yaz → Devam.
3. Google sana bir TXT değeri verir: `google-site-verification=...` ile başlar. Kopyala.
4. Cloudflare → `visulaserz.com` → **DNS** → **Records** → **Add record**:
   - Type: `TXT`
   - Name: `@`
   - Content: Google'ın verdiği değerin tamamı
   - TTL: Auto → **Save**
5. Search Console'a dön → **Doğrula**. Olmazsa 5–10 dakika bekleyip tekrar dene.
6. Soldan **Site haritaları** → `sitemap.xml` yaz → **Gönder**. (Tam adres: `https://visulaserz.com/sitemap.xml`; 132 adres içerir.)
7. Üstteki arama kutusuna (URL Denetimi) şu adresleri tek tek yaz ve **Dizine eklenmesini iste**'ye bas. Günde 10 kadar istek hakkın var:
   - `https://visulaserz.com/`
   - `https://visulaserz.com/tr`
   - `https://visulaserz.com/music-visualizer`
   - `https://visulaserz.com/slowed-reverb`
   - `https://visulaserz.com/lyric-video-maker`
   - `https://visulaserz.com/online-daw`
   - `https://visulaserz.com/scenes`

"Alan adı" mülkü `www` ve `http` sürümlerini de kapsar; ayrıca eklemen gerekmez. `www.visulaserz.com` artık kendiliğinden `visulaserz.com`'a yönleniyor.

İlk veriler 2–4 gün içinde gelir. **Performans** raporundaki sorgular (insanların ne arayıp seni bulduğu) 2–4 hafta sonra anlam kazanır.

## 2. Bing Webmaster Tools (yaklaşık 10 dakika)

Bing; Yahoo'yu, DuckDuckGo'yu ve bazı yapay zekâ arama araçlarını da besler.

1. https://www.bing.com/webmasters → giriş yap.
2. En hızlısı: **Import from Google Search Console**. Google'daki doğrulamayı ve site haritasını kendisi alır.
3. İçe aktarma olmazsa: **Add site** → `https://visulaserz.com` → doğrulama için DNS seçeneğini seç, verdiği kaydı Cloudflare'e 1. adımdaki gibi ekle → site haritası olarak `https://visulaserz.com/sitemap.xml` gönder.

## 3. Yandex Webmaster (isteğe bağlı, 10 dakika)

Türkiye'de de kullanılıyor. https://webmaster.yandex.com → site ekle → DNS TXT ile doğrula (Cloudflare'de aynı yöntem) → **Indexing → Sitemap files** → site haritasını ekle.

---

## 4. Tanıtım paylaşımları (taslaklar)

Genel kurallar:
- Her toplulukta önce kuralları oku. Birçoğu kendi ürününü paylaşmayı sadece belirli günlerde ya da belirli başlıklarda kabul ediyor.
- Reklam gibi değil, yapan kişi olarak yaz; yorumlara cevap ver. İlk saatlerdeki yorumlar görünürlüğü belirliyor.
- Aynı metni aynı gün her yere yapıştırma; her yere biraz uyarla ve günlere yay.
- Her linkte `?ref=` kullan (bkz. 5. bölüm); hangi paylaşımın ziyaretçi getirdiğini yönetim panelinde görürsün.
- YouTube'dan indirme özelliğini öne çıkarma. Tanıtımda görselleştirici, söz videosu, slowed + reverb ve stüdyo üzerine kal; hukuki risk orada.

### Product Hunt

En iyi gün: salı, çarşamba ya da perşembe. Gün, Pasifik saatiyle gece 00:01'de başlar (Türkiye saatiyle 10:01). Lansmanı o saatte yayınla.

- **Name:** Visulaserz
- **Tagline** (60 karakter sınırı): `A music visualizer you can play, in your browser`
- **Link:** `https://visulaserz.com/?ref=producthunt`
- **Topics:** Music, Video, Web App, Design Tools
- **Gallery:** `public/og/` klasöründeki 1200×630 kartlar (site.jpg, music-visualizer.jpg, lyric-video-maker.jpg, online-daw.jpg, visualizer-for-tiktok.jpg) ve 30–60 saniyelik bir ekran kaydı. Kayıt için uygulamada demo şarkıyla birkaç sahne değiştirip REC'e basman yeterli.
- **Description:**

  > Drop in a track and Visulaserz turns it into a laser show, a night drive or a koi pond that moves with the beat. 102 scenes, animated lyrics, one-click slowed + reverb, an FL Studio-style studio locked to the song's tempo and key, and video export for TikTok, Reels and YouTube. Free, in your browser, nothing to install.

- **İlk yorum (maker comment):**

  > Hi Product Hunt! I built Visulaserz because every visualizer I tried either looked like a 2005 screensaver or wanted me to upload my song and wait for a render. This one runs live in your browser: the scenes listen to the beat, the bass and the melody, and you can play with it like an instrument — pads for strobe, freeze and drop, a slowed + reverb rack, a little DAW over the song. When it looks right, press REC or render an MP4 in 9:16 for TikTok. Ten scenes are open to everyone; a free account opens all 102. I'd love to hear which scene you'd want next.

### Reddit

Uygun yerler (kuralları mutlaka oku):
- **r/SideProject**: kendi projeni paylaşmak serbest.
- **r/InternetIsBeautiful**: ücretsiz, tarayıcıda çalışan, ilginç siteler için. Başlık sade olmalı, satış dili kullanma.
- **r/webdev**: sadece **Showoff Saturday** (cumartesi) başlıklarında.
- **r/WebGL**, **r/creativecoding**: shader'lar ve tekniğin kendisi ilgilerini çeker; nasıl yaptığını anlat.
- **r/edmproduction**, **r/makinghiphop**: kendi tanıtımına katı kurallar var, genelde sadece haftalık "feedback/self-promo" başlıklarında.

Taslak (r/SideProject ya da r/InternetIsBeautiful):

> **Başlık:** I made a music visualizer you can play in the browser (102 scenes, lyric videos, slowed + reverb)
>
> Drop in an MP3 and pick a scene: lasers, a night motorway, a koi pond, Winamp-style MilkDrop, a festival stage. Each scene ties its parts to different frequency bands, so it actually follows the song, not just the volume. You can record a vertical video for TikTok in the browser, add timed lyrics, or play with the slowed + reverb rack.
>
> No install and no upload: the file you drop stays on your computer. 10 scenes are open to everyone; a free account unlocks the rest.
>
> https://visulaserz.com/?ref=reddit-sideproject
>
> Feedback very welcome, especially on which scenes feel right for which genres.

r/WebGL / r/creativecoding için teknik taslak:

> **Başlık:** 102 audio-reactive GLSL scenes in one browser app — each element on its own frequency band
>
> I've been building a visualizer where every scene is a fragment shader fed with a 6-row spectrum texture (spectrum, waveform, peaks, slow average, left/right), beat and tempo detection, and a few smoothed "travel" clocks. The rule I set myself: every visible element listens to a different band, and nothing moves when the music is silent. Ray-marched koi, analytic god rays in an Ottoman bath, a reaction–diffusion reef, a Lorenz attractor traced live…
>
> https://visulaserz.com/scenes?ref=reddit-webgl
>
> Happy to talk about any of the shaders.

### Türk toplulukları

- **Technopat Sosyal** ve **DonanımHaber**: "kendi projem / yazılım" bölümleri.
- **Ekşi Sözlük**: kendi tanıtımı hoş karşılanmaz. Tanıtım yerine bir "visulaserz" başlığı açıp sade bir tanım girebilirsin; reklam gibi olmamalı.
- **r/Turkey** ve **r/KGBTR**: kuralları ayrı ayrı oku; bazı günler kendi işini paylaşmaya açık.
- Türk müzik üreticisi ve edit'çi Discord sunucuları, Instagram ve TikTok'taki slowed + reverb edit hesapları.

Taslak (forum):

> **Başlık:** Tarayıcıda çalışan, müzikle hareket eden bir görselleştirici yaptım (ücretsiz)
>
> Merhaba, birkaç aydır üzerinde çalıştığım projeyi paylaşmak istedim: Visulaserz. Bir şarkı bırakıyorsun; lazer şovu, gece yolculuğu, Boğaziçi, Kapadokya, Doğu Ekspresi gibi 102 sahneden biri müzikle birlikte hareket ediyor. Her sahne şarkının farklı frekans bantlarını dinliyor; bas başka şeyi, melodi başka şeyi oynatıyor.
>
> Neler var: tek tıkla slowed + reverb, nightcore, lo-fi; zamanlı ve animasyonlu şarkı sözleri; FL Studio düzeninde, şarkının tempo ve tonuna kilitli küçük bir stüdyo; TikTok ve Reels için 9:16 video kaydı.
>
> Kurulum yok, dosyan bilgisayarından çıkmıyor. 10 sahne hesapsız açık, ücretsiz hesapla hepsi açılıyor.
>
> https://visulaserz.com/tr?ref=forum-technopat
>
> Yorumlarınızı ve önerilerinizi bekliyorum, özellikle hangi sahneyi eklememi istersiniz?

### Dizinler ve alternatif siteleri

- **AlternativeTo** (https://alternativeto.net): ücretsiz bir hesapla "Add application" → Visulaserz. Specterr, Videobolt ve Renderforest'in müzik görselleştiricisinin alternatifi olarak ekle; etiketler: music visualizer, audio visualizer, lyric video, slowed reverb, online DAW, web app.
- **SaaSHub**, **Uneed**, **BetaList**, **Indie Hackers → Products**: kısa açıklama ve `public/og/site.jpg` yeterli.
- Her birinde link olarak `https://visulaserz.com/?ref=<sitenin-adı>` kullan.

Hepsi tek seferlik işler; bu dizinlerden gelen bağlantılar Google'ın siteye güvenmesine de yardım eder. Bağlantı satın alma, toplu forum mesajı ve anahtar kelime doldurma gibi yollara girme; Google bunları cezalandırıyor.

---

## 5. Kısa video planı ve `?ref=` linkleri

Her paylaşımın linkine bir etiket ekle:

```
https://visulaserz.com/?ref=tiktok-bio
https://visulaserz.com/scene/koi?ref=reels-koi
https://visulaserz.com/tr/slowed-reverb?ref=tiktok-slowed1
```

Kurallar: küçük harf, rakam, nokta, alt çizgi ve tire; en fazla 40 karakter. Yönetim panelinde **Trafik → Campaign links** her etiketin kaç ziyaret getirdiğini gösterir. Hangi sayfaların açıldığını **Most visited pages**, Google'ın hangi sayfaları okuduğunu **Pages search engines read** gösterir.

Haftada 3 video için fikirler:
1. **"Bu şarkı bu sahnede"**: 10–15 saniye, bir sahne ve şarkı. Altyazı: "visulaserz.com'da ücretsiz, tarayıcıda." Her hafta farklı bir sahne; Boğaziçi, Kapadokya, Doğu Ekspresi ve Hamam Türk izleyiciye iyi gelir.
2. **Önce / sonra**: aynı şarkı önce normal, sonra tek tıkla slowed + reverb. Ekran kaydı.
3. **60 saniyede beat**: Studio'da bir şarkının üstüne davul ve bas. Ekran kaydı ve hızlandırılmış.
4. **Söz videosu**: telifi sende olan ya da telifsiz bir şarkıyla, 9:16, animasyonlu sözler.
5. **"Hangi sahne?" anketi**: üç sahneyi yan yana göster, yorumlarda oylat.

Telif: TikTok, Instagram ve YouTube telif sistemleri videoları sessize alabilir ya da kaldırabilir. Kendi müziğini ya da telifsiz müzik kullan; YouTube Ses Kitaplığı ve Pixabay Music iyi kaynaklar. Platformun kendi müzik kitaplığından sonradan ses eklersen görüntü o müzikle senkron olmaz. Büyümenin en güçlü yolu küçük sanatçılar olabilir: kendi şarkılarına ücretsiz görsel yapıp seni etiketlemelerini iste.

Misafirlerin videolarının köşesinde artık küçük bir "made with visulaserz.com" yazısı çıkıyor. Ücretsiz hesap açan bunu kaldırabiliyor. Bu iki yönlü çalışır: paylaşılan her misafir videosu reklam olur, yazıyı kaldırmak isteyen de üye olur.

---

## 6. Haftalık kontrol (10 dakika)

- **Yönetim paneli → Trafik**: Most visited pages, Where they came from, Campaign links, Pages search engines read.
- **Search Console → Performans**: hangi sorgularla bulunduğun, tıklanma oranı. Bir sayfa çok görünüp az tıklanıyorsa başlığını ve açıklamasını birlikte değiştiririz.
- **Search Console → Sayfalar**: "Taranmış, dizine eklenmemiş" çoksa söyle, o sayfaların içeriğini güçlendiririz.

---

## Sitede neler var (benim yaptıklarım)

- Her sahne ve her araç için ayrı bir sayfa (`/scene/koi`, `/tool/studio`); her sayfadan uygulamayı o sahne ya da araç açık halde başlatan bir buton (`/?scene=koi`, `/?tool=studio`).
- Sahne ve araç dizinleri: `/scenes`, `/tools`.
- İngilizce kullanım sayfaları: `/music-visualizer`, `/lyric-video-maker`, `/slowed-reverb`, `/online-daw`, `/visualizer-for-tiktok`.
- Türkçe sayfalar: `/tr`, `/tr/slowed-reverb`, `/tr/sarki-sozu-videosu`, `/tr/online-daw`, `/tr/dikey-video`. Her biri İngilizce eşiyle hreflang ile bağlı.
- Her sayfada başlık, açıklama, canonical adres, 1200×630 paylaşım görseli (WhatsApp, X, Discord önizlemeleri için) ve yapılandırılmış veri.
- `sitemap.xml` (sahne görselleriyle birlikte) ve `robots.txt`.
- `www` → `visulaserz.com` yönlendirmesi; `.html` uzantılı ve sonu `/` ile biten adresler tek adrese toplanıyor; olmayan sayfalar için düzgün bir 404 sayfası.
- Misafir videolarında "made with visulaserz.com" yazısı; ücretsiz hesapla kalkıyor.
- Yönetim panelinde en çok ziyaret edilen sayfalar ve arama motorlarının okuduğu sayfalar.
