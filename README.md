# OpenDoor CRM (PWA + Firebase)
1) В Firebase Console → Authentication: включите Google и добавьте домен `kuanysh0799.github.io` в Authorized domains.
2) Проверьте `firebase-config.js` (ключи уже стоят).
3) Залейте файлы в GitHub Pages (ветка `main`, папка `/Opendoor` или корень репозитория).
4) Откройте сайт → Войти → работаем.

### Firestore Rules (минимальные для старта)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

Позже можно ужесточить правила под роли `owner/manager`.
