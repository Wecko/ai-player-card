# AI Player — karta pro Home Assistant

Lovelace karta, která přehrává média z knihovny ai-player přímo v prohlížeči,
kde je otevřený HA dashboard. Umí procházet knihovnu, hledat, playlisty,
frontu, shuffle/repeat a sleep timer (vypnutí / konec skladby / minuty
s fade-outem).

## Publikace repozitáře (jednou)

Tato složka je připravená jako samostatný HACS repozitář — obsahuje
`ai-player-card.js`, `hacs.json` a toto README v kořeni, což je přesně
struktura, kterou HACS typ **Dashboard** vyžaduje.

```sh
cd homeassistant
git init -b main
git add .
git commit -m "AI Player card for Home Assistant"
git remote add origin git@github.com:<user>/ai-player-card.git
git push -u origin main
```

Repozitář musí být **veřejný**, jinak ho HACS nenačte.

## Instalace v HA přes HACS

1. **HACS → ⋮ → Custom repositories** → přidej URL repozitáře, typ **Dashboard**
2. Otevři „AI Player Card" → **Download**
3. HACS prostředek (`/hacsfiles/ai-player-card/ai-player-card.js`) přidá sám
4. Na dashboard přidej kartu:

```yaml
type: custom:ai-player-card
url: https://player.example.com
token: apt_xxxxxxxx
title: Přehrávač   # volitelné
```

### Ručně (bez HACS)

1. Zkopíruj `ai-player-card.js` do HA do `config/www/ai-player-card.js`.
2. **Nastavení → Dashboardy → ⋮ → Prostředky → Přidat prostředek**
   - URL: `/local/ai-player-card.js`, typ: JavaScript modul
3. Přidej kartu jako výše.

## API token

Karta se k aplikaci přihlašuje Bearer tokenem. Na serveru s aplikací:

```sh
php artisan app:token create uzivatel@example.com "Home Assistant"
```

Token se ukáže **jednou** — ulož ho. Přehled a zrušení:

```sh
php artisan app:token list
php artisan app:token revoke <id>
```

## Poznámky

- `url` musí být dosažitelná z prohlížeče, kde běží dashboard (klidně
  lokální IP). Pokud je aplikace jen na HTTP a HA na HTTPS, prohlížeč
  může blokovat mixed content — pak dej kartě HTTP(S) adresu odpovídající
  schématu, nebo HA povol nezabezpečený obsah pro danou stránku.
- Zvuk hraje v prohlížeči s dashboardem — karta je samostatný přehrávač,
  nesdílí stav s webovým přehrávačem aplikace.
- Prohlížeče blokují autoplay: první spuštění vyžaduje klik do stránky.
- Na straně aplikace musí být povolený CORS pro `api/*` a `media/*`
  (v ai-player od verze s `config/cors.php` je to součástí).
