package com.jewelry.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

/** Razorpay webhook signature check; nothing here touches the gateway. */
class PaymentWebhookServiceTest {

    private static final String SECRET = "whsec_test_0123456789";
    private static final String BODY = "{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_1\",\"order_id\":\"order_1\"}}}}";

    private PaymentWebhookService service;

    @BeforeEach
    void setUp() {
        service = new PaymentWebhookService();
    }

    private void secret(String value) {
        ReflectionTestUtils.setField(service, "webhookSecret", value);
    }

    /** What Razorpay puts in X-Razorpay-Signature: hex HMAC-SHA256 of the raw body. */
    private static String sign(String body, String secret) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        StringBuilder hex = new StringBuilder();
        for (byte b : mac.doFinal(body.getBytes(StandardCharsets.UTF_8))) {
            hex.append(String.format("%02x", b));
        }
        return hex.toString();
    }

    @Test
    void unsetSecretRejectsEverything() throws Exception {
        secret(null);
        assertThat(service.verify(BODY, sign(BODY, SECRET))).isFalse();
        secret("   ");
        assertThat(service.verify(BODY, sign(BODY, SECRET))).isFalse();
    }

    @Test
    void wrongSignatureIsRejected() throws Exception {
        secret(SECRET);
        assertThat(service.verify(BODY, sign(BODY, "some-other-secret"))).isFalse();
        assertThat(service.verify(BODY, "deadbeef")).isFalse();
        assertThat(service.verify(BODY, "not even hex")).isFalse();
    }

    @Test
    void tamperedBodyIsRejected() throws Exception {
        secret(SECRET);
        String signature = sign(BODY, SECRET);
        assertThat(service.verify(BODY.replace("order_1", "order_2"), signature)).isFalse();
    }

    @Test
    void missingBodyOrSignatureIsRejected() throws Exception {
        secret(SECRET);
        assertThat(service.verify(null, sign(BODY, SECRET))).isFalse();
        assertThat(service.verify(BODY, null)).isFalse();
        assertThat(service.verify(BODY, "")).isFalse();
    }

    @Test
    void correctSignatureIsAccepted() throws Exception {
        secret(SECRET);
        assertThat(service.verify(BODY, sign(BODY, SECRET))).isTrue();
    }
}
