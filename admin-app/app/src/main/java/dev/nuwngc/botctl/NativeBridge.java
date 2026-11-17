package dev.nuwngc.botctl;

import android.Manifest;
import android.app.KeyguardManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cau noi giua giao dien (HTML/JS trong WebView) va phan Android that:
 * mang, luu tru ma hoa, khoa man hinh, thong bao nen, clipboard.
 * Chi trang trong assets cua app moi goi duoc (MainActivity chan moi dia chi khac).
 * Mat khau KHONG bao gio duoc tra ve cho JS.
 */
final class NativeBridge {
    private final MainActivity act;
    private final WebView web;
    private final SecureStore store;
    private final ApiClient api;
    private final ExecutorService pool = Executors.newFixedThreadPool(3);
    private String lockId;
    private String notifyId;

    NativeBridge(MainActivity act, WebView web, SecureStore store, ApiClient api) {
        this.act = act;
        this.web = web;
        this.store = store;
        this.api = api;
    }

    /* ---------- tra ket qua ve JS ---------- */

    private void resolve(String id, String json) {
        final String js = "window.__nativeResolve(" + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")";
        web.post(new Runnable() {
            @Override
            public void run() {
                web.evaluateJavascript(js, null);
            }
        });
    }

    private boolean lockAvailable() {
        KeyguardManager km = (KeyguardManager) act.getSystemService(Context.KEYGUARD_SERVICE);
        return km != null && km.isDeviceSecure();
    }

    /* ---------- cau hinh ---------- */

    @JavascriptInterface
    public String config() {
        try {
            JSONObject o = new JSONObject();
            o.put("server", store.plain("server", ""));
            o.put("user", store.plain("user", ""));
            o.put("hasPass", store.secret("pass") != null);
            o.put("lock", store.flag("lock"));
            o.put("watch", store.flag("watch"));
            o.put("secure", store.flag("secure"));
            o.put("lockAvailable", lockAvailable());
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("version", act.versionName());
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    /** pass rong = giu mat khau cu. Tra ve {"ok":true} hoac {"ok":false,"error":"..."} */
    @JavascriptInterface
    public String saveConfig(String server, String user, String pass) {
        try {
            String s = server == null ? "" : server.trim();
            while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
            if (!s.startsWith("https://") || s.length() < 12 || s.contains(" ")) {
                return "{\"ok\":false,\"error\":\"Địa chỉ máy chủ phải bắt đầu bằng https://\"}";
            }
            if (user == null || user.trim().isEmpty()) return "{\"ok\":false,\"error\":\"Nhập tên đăng nhập\"}";
            store.putPlain("server", s);
            store.putPlain("user", user.trim());
            if (pass != null && !pass.isEmpty()) store.putSecret("pass", pass);
            if (store.secret("pass") == null) return "{\"ok\":false,\"error\":\"Nhập mật khẩu\"}";
            api.clearSession();
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
        }
    }

    @JavascriptInterface
    public void logout() {
        api.clearSession();
        store.removeSecret("pass");
        store.setFlag("watch", false);
        WatchJob.schedule(act, false);
    }

    /* ---------- mang ---------- */

    @JavascriptInterface
    public void request(final String id, final String method, final String path, final String body) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    resolve(id, api.call(method, path, body, true).toJson());
                } catch (Exception e) {
                    resolve(id, ApiClient.errorJson(e.getMessage()));
                }
            }
        });
    }

    @JavascriptInterface
    public void login(final String id) {
        pool.execute(new Runnable() {
            @Override
            public void run() {
                resolve(id, api.login().toJson());
            }
        });
    }

    /* ---------- khoa app bang man hinh khoa cua may ---------- */

    @JavascriptInterface
    public void unlock(final String id) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (!lockAvailable()) {
                    resolve(id, "{\"ok\":true,\"unavailable\":true}");
                    return;
                }
                KeyguardManager km = (KeyguardManager) act.getSystemService(Context.KEYGUARD_SERVICE);
                Intent i = km.createConfirmDeviceCredentialIntent("botctl", "Xác thực để mở bảng điều khiển admin");
                if (i == null) {
                    resolve(id, "{\"ok\":true,\"unavailable\":true}");
                    return;
                }
                lockId = id;
                act.startActivityForResult(i, MainActivity.REQ_LOCK);
            }
        });
    }

    void onLockResult(boolean ok) {
        if (lockId != null) resolve(lockId, ok ? "{\"ok\":true}" : "{\"ok\":false}");
        lockId = null;
    }

    /* ---------- tuy chon ---------- */

    @JavascriptInterface
    public void setFlag(final String name, final boolean value) {
        if (!"lock".equals(name) && !"watch".equals(name) && !"secure".equals(name)) return;
        store.setFlag(name, value);
        if ("secure".equals(name)) {
            act.runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (value) act.getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
                    else act.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
                }
            });
        }
        if ("watch".equals(name)) {
            if (value) store.putPlainLong("watch_after", -1);
            WatchJob.schedule(act, value);
        }
    }

    /** Android 13+ can xin quyen gui thong bao. Tra ve {"ok":true} neu da duoc cap. */
    @JavascriptInterface
    public void requestNotify(final String id) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (Build.VERSION.SDK_INT < 33 || act.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                    resolve(id, "{\"ok\":true}");
                    return;
                }
                notifyId = id;
                act.requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, MainActivity.REQ_NOTIFY);
            }
        });
    }

    void onNotifyResult(boolean granted) {
        if (notifyId != null) resolve(notifyId, granted ? "{\"ok\":true}" : "{\"ok\":false}");
        notifyId = null;
    }

    /* ---------- tien ich ---------- */

    @JavascriptInterface
    public void copy(final String text) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
                if (cm != null) cm.setPrimaryClip(ClipData.newPlainText("botctl", text));
            }
        });
    }

    @JavascriptInterface
    public void share(final String text) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                act.startActivity(Intent.createChooser(i, "Chia sẻ"));
            }
        });
    }

    @JavascriptInterface
    public void toast(final String text) {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(act, text, Toast.LENGTH_SHORT).show();
            }
        });
    }

    @JavascriptInterface
    public void exit() {
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                act.finish();
            }
        });
    }
}
