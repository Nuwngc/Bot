package dev.nuwngc.botctl;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Luu cau hinh. Mat khau duoc ma hoa AES-GCM bang khoa nam trong Android Keystore
 * (khoa khong the lay ra khoi may), nen sao luu hay root doc file cung khong thay mat khau that.
 */
final class SecureStore {
    private static final String ALIAS = "botctl_aes";
    private final SharedPreferences prefs;

    SecureStore(Context ctx) {
        prefs = ctx.getApplicationContext().getSharedPreferences("botctl", Context.MODE_PRIVATE);
    }

    String plain(String k, String def) { return prefs.getString("p_" + k, def); }
    void putPlain(String k, String v) { prefs.edit().putString("p_" + k, v).apply(); }
    long plainLong(String k, long def) { return prefs.getLong("l_" + k, def); }
    void putPlainLong(String k, long v) { prefs.edit().putLong("l_" + k, v).apply(); }
    boolean flag(String k) { return prefs.getBoolean("f_" + k, false); }
    void setFlag(String k, boolean v) { prefs.edit().putBoolean("f_" + k, v).apply(); }
    void removeSecret(String k) { prefs.edit().remove("s_" + k).apply(); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
        ks.load(null);
        if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        gen.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return gen.generateKey();
    }

    void putSecret(String k, String value) {
        try {
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.ENCRYPT_MODE, key());
            byte[] iv = c.getIV();
            byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
            String packed = Base64.encodeToString(iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP);
            prefs.edit().putString("s_" + k, packed).apply();
        } catch (Exception e) {
            throw new IllegalStateException("Không mã hoá được: " + e.getMessage());
        }
    }

    /** null neu chua luu hoac khong giai ma duoc (vi du khoa Keystore da doi) */
    String secret(String k) {
        String packed = prefs.getString("s_" + k, null);
        if (packed == null) return null;
        try {
            String[] parts = packed.split(":");
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] ct = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
            c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(c.doFinal(ct), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }
}
