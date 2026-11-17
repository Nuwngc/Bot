package dev.nuwngc.botctl;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import java.io.ByteArrayInputStream;
import java.util.HashMap;

/**
 * Giao dien la HTML/CSS/JS trong assets, chay trong WebView nhung KHONG tai gi tu Internet:
 * moi yeu cau toi dia chi ngoai assets deu bi chan. Moi cuoc goi mang di qua NativeBridge -> ApiClient.
 */
public class MainActivity extends Activity {
    static final int REQ_LOCK = 71;
    static final int REQ_NOTIFY = 72;
    private static final String HOST = "appassets.androidplatform.net";

    private WebView web;
    private NativeBridge bridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        setContentView(web);

        SecureStore store = new SecureStore(this);
        bridge = new NativeBridge(this, web, store, new ApiClient(store));

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);

        web.setBackgroundColor(0xFF0D0F17);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) WebView.setWebContentsDebuggingEnabled(true);
        web.addJavascriptInterface(bridge, "Native");

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) {
                    WebResourceResponse r = loader.shouldInterceptRequest(u);
                    if (r != null) return r;
                }
                // Chan moi thu khong nam trong app
                return new WebResourceResponse("text/plain", "utf-8", 403, "Blocked", new HashMap<String, String>(), new ByteArrayInputStream(new byte[0]));
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOST.equals(request.getUrl().getHost());
            }
        });

        if (store.flag("secure")) getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
        web.loadUrl("https://" + HOST + "/assets/index.html");
    }

    String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "?";
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_LOCK) bridge.onLockResult(resultCode == RESULT_OK);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIFY) bridge.onNotifyResult(grantResults.length > 0 && grantResults[0] == 0);
    }

    /** Nut Back: giao dien tu xu ly truoc (dong hop thoai, quay ve tab dau), khong con gi thi thoat app */
    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.__onBack ? window.__onBack() : false)", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.removeJavascriptInterface("Native");
            web.destroy();
        }
        super.onDestroy();
    }
}
