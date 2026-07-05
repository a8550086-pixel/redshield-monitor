# RedShield Monitor

בוט מבוסס Node.js + Playwright ש:
1. מתחבר ל-`https://app.getredshield.com`.
2. שומר את ה-Session (עוגיות / localStorage) אחרי ההתחברות הראשונה, כדי לא להתחבר מחדש בכל הפעלה.
3. בודק כל X שניות (ברירת מחדל: 5) אם התווסף אירוע/התראה חדשים.
4. פותח כל אירוע חדש וקורא את כל הטקסט המלא שלו.
5. מונע כפילויות (שומר רשימת IDs שכבר נשלחו, גם בין הפעלות מחדש של השרת).
6. שולח JSON ל-Webhook של n8n עבור כל אירוע חדש.
7. מוכן לפריסה ב-Render (Docker + `render.yaml`).

## ⚠️ חשוב לפני שמריצים: הסלקטורים

אין לי גישה מאומתת (מחוברת) לדשבורד של RedShield, ולכן לא ניתן לדעת מראש את מבנה ה-DOM המדויק
(שמות class, מזהי data-testid וכו') של טופס ההתחברות ושל רשימת האירועים. **הפרויקט בנוי כך
שכל הסלקטורים מוגדרים דרך משתני סביבה** (ב-`.env` או ב-`render.yaml`) — כלומר אין צורך לגעת
בקוד, רק לעדכן ערכים.

### איך מוצאים את הסלקטורים הנכונים
1. היכנסו ידנית לאתר בדפדפן, פתחו DevTools (F12) → לשונית Elements.
2. עבור טופס ההתחברות: לחצו-ימני על שדה האימייל → Inspect, ומצאו סלקטור ייחודי
   (למשל `input[name="email"]` או `#login-email`). כנ"ל עבור הסיסמה וכפתור השליחה.
3. עבור סימון "מחובר בהצלחה": מצאו אלמנט שמופיע רק אחרי login (תפריט צד, שם המשתמש וכו').
4. עבור רשימת האירועים: מצאו את השורה/כרטיס שחוזר על עצמו לכל אירוע (שורת טבלה, כרטיס וכו'),
   ובדקו אם יש לו attribute ייחודי (`data-id`, `id`) או קישור `<a href="...">` פנימי.
5. עבור תצוגת האירוע המלאה: מצאו את האלמנט שעוטף את כל תוכן הפרטים לאחר פתיחה.

עדכנו את הערכים המתאימים ב-`.env` (מקומית) או ב-Environment Variables של Render:

```
SEL_LOGIN_EMAIL
SEL_LOGIN_PASSWORD
SEL_LOGIN_SUBMIT
SEL_LOGGED_IN_MARKER
SEL_EVENT_ITEM
SEL_EVENT_ID_ATTR
SEL_EVENT_LINK
SEL_EVENT_DETAIL
```

ברירות המחדל ב-`.env.example` הן ניחושים סבירים (סלקטורים גנריים כמו `table tbody tr`,
`input[type="email"]` וכו') כדי שהפרויקט ירוץ "out of the box" על אתרים רבים, אך סביר שיהיה
צורך לכוונן אותם לאתר הספציפי.

## מבנה הפרויקט

```
redshield-monitor/
├── Dockerfile              # תמונת Docker מבוססת Playwright הרשמית (כולל Chromium)
├── render.yaml              # Render Blueprint - פריסה בלחיצה אחת
├── package.json
├── .env.example              # כל משתני הסביבה עם הסברים
├── .gitignore
├── scripts/
│   └── install-browsers.js   # postinstall - מתקין Chromium מקומית, מדלג בתוך Docker
├── src/
│   ├── index.js               # נקודת כניסה: לולאת polling + שרת health
│   ├── config.js               # טעינת כל משתני הסביבה
│   ├── logger.js                # לוגר עם timestamp
│   ├── browserSession.js         # ניהול דפדפן, login, שמירת/טעינת session
│   ├── eventMonitor.js            # קריאת רשימת אירועים, פתיחה, חילוץ טקסט
│   ├── dedupeStore.js              # מניעת כפילויות (persisted to disk)
│   └── webhookClient.js             # שליחה ל-webhook עם retries
└── data/                              # session.json + seen-events.json (persist!)
```

## הרצה מקומית

```bash
npm install                 # יתקין גם Chromium דרך postinstall
cp .env.example .env
# ערכו את .env: REDSHIELD_EMAIL, REDSHIELD_PASSWORD, N8N_WEBHOOK_URL, וכו'
npm start
```

בהרצה ראשונה הדפדפן יתחבר עם המייל/סיסמה מה-`.env`, ישמור session ל-`data/session.json`,
ומאותה נקודה יבדוק כל `POLL_INTERVAL_MS` מילישניות (ברירת מחדל 5000) אם יש אירוע חדש.

להרצה עם דפדפן גלוי (לצורך דיבוג/מציאת סלקטורים), הגדירו `HEADLESS=false` ב-`.env`.

## פריסה ל-Render

### אפשרות א׳: Render Blueprint (מומלץ)
1. דחפו את הפרויקט ל-repo ב-GitHub/GitLab.
2. ב-Render: **New → Blueprint**, בחרו את ה-repo. Render יזהה את `render.yaml` אוטומטית.
3. השלימו את משתני הסביבה המסומנים `sync: false` (הם לא נכתבים ל-YAML מטעמי אבטחה):
   - `REDSHIELD_EMAIL`
   - `REDSHIELD_PASSWORD`
   - `N8N_WEBHOOK_URL`
4. אשרו את יצירת ה-**Persistent Disk** (`redshield-data`, מחובר ל-`/app/data`) —
   **חשוב**: בלי דיסק פרסיסטנטי, ה-session וה-dedupe יימחקו בכל דיפלוי/הפעלה מחדש של השירות,
   מה שיגרום להתחברות מחדש ולסיכון לשליחת אירועים כפולים. Persistent Disks דורשים תוכנית בתשלום
   (לא Free tier).
5. Deploy. השירות מוגדר כ-`type: worker` (תהליך רקע ללא כתובת ציבורית) — זה מתאים כי
   הבוט לא מגיש HTTP, רק מבצע polling. יש בכל זאת שרת health קטן שמאזין על הפורט (ל-Render
   Health Checks/monitoring פנימי אם תרצו לשנות ל-`type: web`).

### אפשרות ב׳: יצירה ידנית ב-Render Dashboard
1. **New → Web Service** או **New → Background Worker**.
2. Environment: **Docker** (יזהה את ה-`Dockerfile` בשורש הפרויקט).
3. הוסיפו את כל משתני הסביבה מ-`.env.example`.
4. הוסיפו Persistent Disk ומחקו/הגדירו mount path ל-`/app/data`.
5. Deploy.

## פורמט ה-JSON שנשלח ל-n8n

עבור כל אירוע חדש שמתגלה, נשלח POST עם Content-Type: application/json:

```json
{
  "id": "12345",
  "source": "redshield",
  "url": "https://app.getredshield.com/events/12345",
  "summary": "טקסט קצר מהשורה ברשימה",
  "fullText": "כל הטקסט שנקרא מתוך עמוד/פאנל הפרטים של האירוע...",
  "detectedAt": "2026-07-05T12:00:00.000Z"
}
```

הגדירו ב-n8n Webhook Node בשיטת POST, ותוכלו לעבד את השדות `summary` / `fullText` להמשך
הזרימה (Slack, Email, מסד נתונים וכו').

## מניעת כפילויות

- לכל אירוע נקבע מזהה (`id`) לפי הסדר הבא: attribute מוגדר (`SEL_EVENT_ID_ATTR`, למשל `data-id`) →
  אם אין, ה-`href` של הקישור → אם גם זה חסר, hash (SHA-256, מקוצר) של הטקסט הנראה בשורה.
- כל ה-IDs שכבר נשלחו נשמרים בקובץ `data/seen-events.json`, וגם נטענים מחדש בעליית השרת —
  כך שגם אחרי restart/דיפלוי (כל עוד יש Persistent Disk) לא יישלחו כפילויות.
- הרשימה מוגבלת ל-`MAX_SEEN_IDS` (ברירת מחדל 5000) כדי שלא תגדל ללא הגבלה — הישנים ביותר
  מוסרים ראשונים (FIFO).

## התאוששות מ-session שפג תוקף

בכל מחזור polling, אם משהו נכשל, הבוט בודק אם עדיין מחובר (`isLoggedIn`) ומנסה להתחבר מחדש
אוטומטית אם לא. אין צורך בהתערבות ידנית במקרה הרגיל, אלא אם RedShield דורש 2FA/CAPTCHA
בהתחברות מחודשת — מקרה כזה ידרוש טיפול ידני נוסף (לא מכוסה בגרסה זו).

## אבטחה

- אף פעם אל תעלו `.env` עם סיסמאות אמיתיות ל-Git (הוא כבר ב-`.gitignore`).
- ב-Render, שמרו את `REDSHIELD_PASSWORD` ו-`N8N_WEBHOOK_URL` כ-Environment Variables מוצפנים
  (לא כ-plain values ב-`render.yaml`) — כך גם מוגדר כאן (`sync: false`).
- שקלו להשתמש ב-webhook URL עם טוקן סודי בנתיב, ולוודא שה-n8n instance מאמת חתימה/כותרת
  Authorization אם זמין.

## מגבלות ידועות

- הסלקטורים הם ברירת מחדל גנרית ודורשים כיוונון לאתר האמיתי (ראו סעיף למעלה).
- אין תמיכה מובנית ב-2FA/CAPTCHA בהתחברות.
- Render Free tier לא תומך ב-Persistent Disk — בלעדיו, ה-session וה-dedupe store לא ישרדו
  דיפלוי מחדש.
