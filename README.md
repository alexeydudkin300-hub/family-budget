# Наш бюджет

Семейное приложение учёта доходов, расходов, обязательных платежей и накоплений. Работает как сайт, добавляется на экран «Домой» iPhone через Safari.

## Состав
- index.html, css/style.css, js/app.js, js/firebase.js
- sw.js (офлайн-кэш, сеть в первую очередь), manifest.json, icons/
- firestore.rules: правила безопасности Firestore

## Запуск без Firebase (демо)
Откройте `index.html?demo`. Данные хранятся только в памяти страницы.

## Настройка Firebase (тариф Spark, бесплатный)
1. Создайте проект в Firebase Console.
2. Включите Authentication → Google и Firestore Database.
3. Скопируйте конфиг из Project settings → Your apps в `js/firebase.js` (вместо заглушек `ВАШ_…`).
4. Вставьте правила из `firestore.rules` во вкладку Rules Firestore и опубликуйте.
5. Добавьте домен сайта (например, `username.github.io`) в Authentication → Settings → Authorized domains.

## Публикация на GitHub Pages
1. Создайте репозиторий и загрузите все файлы проекта в корень.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Откройте адрес вида `https://username.github.io/repo/` в Safari на iPhone.

## Установка на iPhone
Safari → «Поделиться» → «На экран «Домой»». Приложение откроется без адресной строки.

## Обновления
При каждом изменении поднимайте версию `CACHE` в sw.js (например, `budget-v4`), чтобы устройства точно получили новые файлы.

## Что не входит (отложено)
Push-уведомления требуют подписки Firebase Blaze. Вместо них на главном экране показываются предупреждения и метка «Не отмечено» в плане получек.
