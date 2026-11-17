package dev.nuwngc.botctl;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Goi API cua may chu bang HttpURLConnection that (khong qua trinh duyet), tu giu cookie phien "sid".
 * Gap 401 thi tu dang nhap lai bang tai khoan luu trong may roi thu lai mot lan.
 */
final class ApiClient {
    static final class Result {
        final int status;
        final String text;
        final long ms;

        Result(int status, String text, long ms) {
            this.status = status;
            this.text = text;
            this.ms = ms;
        }

        String toJson() {
            try {
                JSONObject o = new JSONObject();
                o.put("status", status);
                o.put("text", text);
                o.put("ms", ms);
                return o.toString();
            } catch (Exception e) {
                return "{\"status\":0,\"error\":\"json\"}";
            }
        }
    }

    private final SecureStore store;
    private final Object loginLock = new Object();
    private volatile String cookie = "";

    ApiClient(SecureStore store) {
        this.store = store;
    }

    static String errorJson(String message) {
        try {
            JSONObject o = new JSONObject();
            o.put("status", 0);
            o.put("error", message == null ? "Lỗi không rõ" : message);
            return o.toString();
        } catch (Exception e) {
            return "{\"status\":0,\"error\":\"loi\"}";
        }
    }

    String baseUrl() {
        String s = store.plain("server", "");
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    boolean hasCredentials() {
        return !baseUrl().isEmpty() && !store.plain("user", "").isEmpty() && store.secret("pass") != null;
    }

    void clearSession() {
        cookie = "";
    }

    /** "/healthz" di thang vao goc may chu, con lai nam duoi /api */
    Result call(String method, String path, String body, boolean retryLogin) throws IOException {
        String base = baseUrl();
        if (base.isEmpty()) throw new IOException("Chưa cấu hình máy chủ");
        if (!path.startsWith("/") || path.contains("..") || path.contains("\n") || path.contains("\r")) {
            throw new IOException("Đường dẫn không hợp lệ");
        }
        String m = method == null ? "GET" : method.toUpperCase();
        if (!m.equals("GET") && !m.equals("POST") && !m.equals("DELETE")) throw new IOException("Phương thức không hỗ trợ: " + m);

        long t0 = System.currentTimeMillis();
        URL url = new URL(path.equals("/healthz") ? base + path : base + "/api" + path);
        HttpURLConnection c = (HttpURLConnection) url.openConnection();
        try {
            c.setRequestMethod(m);
            c.setConnectTimeout(12000);
            c.setReadTimeout(25000);
            c.setInstanceFollowRedirects(false);
            c.setRequestProperty("Accept", "application/json");
            c.setRequestProperty("User-Agent", "botctl-android/1");
            String ck = cookie;
            if (!ck.isEmpty()) c.setRequestProperty("Cookie", ck);
            if (!m.equals("GET") && body != null && !body.isEmpty()) {
                byte[] data = body.getBytes(StandardCharsets.UTF_8);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json");
                c.setFixedLengthStreamingMode(data.length);
                try (OutputStream o = c.getOutputStream()) {
                    o.write(data);
                }
            }
            int code = c.getResponseCode();
            captureCookie(c);
            InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
            String text = in == null ? "" : readAll(in);
            if (code == 401 && retryLogin && !path.equals("/login") && hasCredentials()) {
                if (login().ok) return call(method, path, body, false);
            }
            return new Result(code, text, System.currentTimeMillis() - t0);
        } finally {
            c.disconnect();
        }
    }

    static final class LoginResult {
        final boolean ok;
        final String role;
        final String error;

        LoginResult(boolean ok, String role, String error) {
            this.ok = ok;
            this.role = role;
            this.error = error;
        }

        String toJson() {
            try {
                JSONObject o = new JSONObject();
                o.put("ok", ok);
                o.put("role", role == null ? "" : role);
                o.put("error", error == null ? "" : error);
                return o.toString();
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"json\"}";
            }
        }
    }

    /** Dang nhap bang tai khoan da luu. Chi chap nhan tai khoan admin. */
    LoginResult login() {
        synchronized (loginLock) {
            try {
                String pass = store.secret("pass");
                String user = store.plain("user", "");
                if (pass == null || user.isEmpty()) return new LoginResult(false, null, "Chưa lưu tài khoản");
                JSONObject b = new JSONObject();
                b.put("username", user);
                b.put("password", pass);
                cookie = "";
                Result r = call("POST", "/login", b.toString(), false);
                JSONObject j = r.text.isEmpty() ? new JSONObject() : new JSONObject(r.text);
                if (r.status != 200) {
                    cookie = "";
                    return new LoginResult(false, null, j.optString("error", "Đăng nhập thất bại (HTTP " + r.status + ")"));
                }
                String role = j.optString("role", "");
                if (!"admin".equals(role)) {
                    cookie = "";
                    return new LoginResult(false, role, "Tài khoản này không phải admin");
                }
                return new LoginResult(true, role, null);
            } catch (Exception e) {
                cookie = "";
                return new LoginResult(false, null, "Không kết nối được: " + e.getMessage());
            }
        }
    }

    private void captureCookie(HttpURLConnection c) {
        for (Map.Entry<String, List<String>> e : c.getHeaderFields().entrySet()) {
            if (e.getKey() == null || !e.getKey().equalsIgnoreCase("Set-Cookie")) continue;
            for (String v : e.getValue()) {
                if (v.startsWith("sid=")) {
                    int end = v.indexOf(';');
                    cookie = end < 0 ? v : v.substring(0, end);
                }
            }
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        int total = 0;
        while ((n = in.read(buf)) > 0) {
            total += n;
            if (total > 2 * 1024 * 1024) throw new IOException("Phản hồi quá lớn (>2MB)");
            out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
}
