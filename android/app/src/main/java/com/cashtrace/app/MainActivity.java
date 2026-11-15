package com.cashtrace.app;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new AndroidPrintBridge(), "AndroidPrintBridge");
        }
    }

    private class AndroidPrintBridge {
        @JavascriptInterface
        public void printPage(final String jobName) {
            runOnUiThread(() -> {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    return;
                }
                PrintManager printManager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                if (printManager != null) {
                    String safeName = (jobName != null && !jobName.trim().isEmpty())
                            ? jobName.trim()
                            : "CashTrace_Statement";
                    PrintDocumentAdapter printAdapter = webView.createPrintDocumentAdapter(safeName);
                    printManager.print(safeName, printAdapter, new PrintAttributes.Builder().build());
                }
            });
        }
    }
}

