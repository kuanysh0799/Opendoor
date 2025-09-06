# OpenDoor CRM — Roles (owner/manager)
1) Залейте файлы в GitHub Pages (репозиторий Opendoor).
2) В Firebase Firestore → Rules вставьте содержимое `firestore.rules` и Publish.
3) Откройте сайт с обходом кэша: `...?v=12`.
4) Первый вошедший пользователь автоматически станет `owner`, остальные — `manager`.
