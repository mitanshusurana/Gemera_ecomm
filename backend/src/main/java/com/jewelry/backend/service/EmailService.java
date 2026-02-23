package com.jewelry.backend.service;

import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.entity.EmailSubscription;
import com.jewelry.backend.entity.EmailTemplate;
import com.jewelry.backend.repository.EmailNotificationRepository;
import com.jewelry.backend.repository.EmailSubscriptionRepository;
import com.jewelry.backend.repository.EmailTemplateRepository;
import jakarta.mail.internet.MimeMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class EmailService {

    @Autowired
    private JavaMailSender mailSender;

    @Autowired
    private EmailNotificationRepository notificationRepository;

    @Autowired
    private EmailTemplateRepository templateRepository;

    @Autowired
    private EmailSubscriptionRepository subscriptionRepository;

    public EmailNotification sendEmail(EmailNotification notification) {
        notification.setSentAt(LocalDateTime.now());

        try {
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true);

            helper.setTo(notification.getEmail());
            helper.setSubject(notification.getSubject());

            String htmlContent = "";

            // If template name is provided, try to load and fill
            if (notification.getTemplateName() != null) {
                EmailTemplate template = templateRepository.findByName(notification.getTemplateName())
                    .orElse(null);

                if (template != null) {
                   htmlContent = template.getHtmlContent();
                   // Replace placeholders
                   if (notification.getData() != null) {
                       for (Map.Entry<String, String> entry : notification.getData().entrySet()) {
                           htmlContent = htmlContent.replace("{{" + entry.getKey() + "}}", String.valueOf(entry.getValue()));
                       }
                   }
                } else {
                   // Fallback
                   htmlContent = "<p>Notification: " + notification.getType() + "</p>";
                }
            } else {
                 htmlContent = "<p>No template specified.</p>";
            }

            helper.setText(htmlContent, true);

            // In a real scenario, we would send. Since config is placeholder, this might fail if not valid SMTP.
            // However, we are "Implementing" it.
            // We catch exception to prevent crash.
            try {
                mailSender.send(message);
                notification.setStatus("SENT");
            } catch (Exception e) {
                // If SMTP is not configured or fails
                System.err.println("Failed to send email: " + e.getMessage());
                notification.setStatus("FAILED");
            }

        } catch (Exception e) {
            notification.setStatus("FAILED");
            e.printStackTrace();
        }

        return notificationRepository.save(notification);
    }

    public Page<EmailNotification> getUserNotifications(String email, Pageable pageable) {
        return notificationRepository.findByEmail(email, pageable);
    }

    public EmailNotification getNotification(UUID id) {
        return notificationRepository.findById(id).orElseThrow(() -> new RuntimeException("Notification not found"));
    }

    public void subscribe(String email) {
        EmailSubscription sub = subscriptionRepository.findByEmail(email)
                .orElse(new EmailSubscription());
        sub.setEmail(email);
        sub.setActive(true);
        subscriptionRepository.save(sub);
    }

    public void unsubscribe(String email) {
        subscriptionRepository.findByEmail(email).ifPresent(sub -> {
            sub.setActive(false);
            subscriptionRepository.save(sub);
        });
    }

    public List<EmailTemplate> getAllTemplates() {
        return templateRepository.findAll();
    }

    public EmailTemplate getTemplate(String name) {
        return templateRepository.findByName(name).orElseThrow(() -> new RuntimeException("Template not found"));
    }
}
