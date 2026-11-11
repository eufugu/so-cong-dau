# Setting up Firebase for Sổ công dầu

You do this once, in about 15 minutes. It's free, and no card is needed. Button names may differ slightly if Google has changed its pages.

Keep these two rules in mind:

- **Never share the secret key file** (part 4) or paste it into a chat.
- **Never share a PIN.** You type PINs only into the account tool, on your own computer.

## 1. Create the project

1. Go to https://console.firebase.google.com and sign in with your Google account.
2. Click **Create a project**.
3. Name it `so-cong-dau`. Google may add extra letters or numbers. The final project ID becomes your app's web address: `https://<project-id>.web.app`.
4. Turn **Google Analytics** off, then finish creating the project.

If Firebase offers a paid plan, stay on the free **Spark** plan.

## 2. Turn on the database and sign-in

1. In the left menu, open **Firestore Database** and click **Create database**.
2. Choose the location `asia-southeast1 (Singapore)`. You can't change this later.
3. Choose **production mode**.
4. In the left menu, open **Authentication** and click **Get started**.
5. Under **Sign-in method**, click **Email/Password**, turn on the first switch only, and save.

## 3. Register the web app

1. Click the gear icon next to **Project Overview**, then **Project settings**.
2. Under **Your apps**, click the **web** icon (`</>`).
3. Name it `so-cong-dau`. Leave Firebase Hosting unticked, because it gets connected from this computer. Click **Register app**.
4. Copy the block that starts with `const firebaseConfig = {` and send it to Claude in the chat, along with your project ID. These values are meant to be public, so this is safe.

## 4. Save the secret key

1. Still in **Project settings**, open the **Service accounts** tab.
2. Click **Generate new private key**, then confirm. A `.json` file downloads.
3. Open PowerShell and run these two commands. The second one moves the newest matching file from Downloads, and the name of that file should include your project ID:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.so-cong-dau"
Get-ChildItem "$env:USERPROFILE\Downloads\*firebase-adminsdk*.json" | Sort-Object LastWriteTime | Select-Object -Last 1 | Move-Item -Destination "$env:USERPROFILE\.so-cong-dau\service-account.json"
```

This key gives full control of the book. If you think anyone else has seen it, delete it on the same page and generate a new one.

## 5. Connect this computer

In PowerShell, in the project folder, run this and sign in with the same Google account:

```powershell
npx firebase login
```

## 6. Add the first logins

Do this in **PowerShell**, in the project folder, after Claude confirms the project is connected. The tool asks for each PIN twice and hides what you type.

```powershell
node admin/accounts.js add "Mẹ Liên" --owner
node admin/accounts.js add "Thử nghiệm"
```

`Thử nghiệm` is a test worker for the iPhone test. PINs are exactly 6 digits. Avoid easy ones like `123456` or a birthday, and Mẹ's should be one only Mẹ knows.

Other commands, for later:

```powershell
node admin/accounts.js add "Tên người" --owner
node admin/accounts.js reset "Tên người"
node admin/accounts.js rename "Tên cũ" "Tên mới"
node admin/accounts.js remove "Tên người"
node admin/accounts.js list
```

`--owner` gives that person the same rights as Mẹ. `rename` keeps the person and their PIN and changes the name they pick at sign-in; rows they already wrote keep the old name. Mẹ Liên cannot be renamed, because the money book matches on that exact name. After `add`, `rename` or `remove`, deploy the app again so the sign-in screen shows the new list.

## 7. Test on the iPhone

Claude will send you the web address once the app is online. On the iPhone 13 Pro:

1. Open the address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open the app from the new icon, not from Safari.
4. Sign in as `Thử nghiệm` and record one test entry, such as one carton under **Sản xuất**.
5. Tell Claude what happened. If anything goes wrong, send a photo of the screen.

Then repeat on an Android phone, using Chrome and its **Add to Home screen** or **Install app** option.
