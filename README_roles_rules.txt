# OpenDoor CRM — заметки по ролям и правилам Firestore

Чтобы *менеджеры не могли удалять клиентов*, а только админ:
1. В базе создаётся коллекция **admins**, где документ с ID = `uid` администратора.
   - Первый вошедший пользователь автоматически становится админом (клиентская инициализация).
2. Рекомендуемые правила Firestore:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // кто угодно из авторизованных может читать/писать сделки и клиентов (ограничим удаление ниже)
    match /leads/{id} {
      allow read, write: if request.auth != null;
    }
    match /clients/{id} {
      allow read, create, update: if request.auth != null;
      allow delete: if request.auth != null
                    && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
    // роли-админы
    match /admins/{uid} {
      // первый пользователь успеет создать свой документ; далее — только админ
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow delete, update: if request.auth != null
                            && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
  }
}
```
3. После публикации правил обнови страницу с приложением.
