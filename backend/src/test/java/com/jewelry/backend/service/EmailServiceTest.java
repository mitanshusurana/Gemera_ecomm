package com.jewelry.backend.service;

import com.jewelry.backend.entity.EmailNotification;
import com.jewelry.backend.entity.EmailTemplate;
import com.jewelry.backend.repository.EmailNotificationRepository;
import com.jewelry.backend.repository.EmailTemplateRepository;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mail.javamail.JavaMailSender;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
public class EmailServiceTest {

    @Mock
    private JavaMailSender mailSender;

    @Mock
    private EmailNotificationRepository notificationRepository;

    @Mock
    private EmailTemplateRepository templateRepository;

    @InjectMocks
    private EmailService emailService;

    @Test
    public void testSendEmailWithTemplate() throws Exception {
        EmailNotification notification = new EmailNotification();
        notification.setEmail("test@test.com");
        notification.setSubject("Test Subject");
        notification.setTemplateName("welcome");

        Map<String, String> data = new HashMap<>();
        data.put("name", "John Doe");
        data.put("link", "http://example.com");
        notification.setData(data);

        EmailTemplate template = new EmailTemplate();
        template.setName("welcome");
        template.setHtmlContent("Hello {{name}}, welcome to {{link}}! Unused {{unused}}. Also missing close {{missing");

        when(templateRepository.findByName("welcome")).thenReturn(Optional.of(template));

        MimeMessage mimeMessage = mock(MimeMessage.class);
        when(mailSender.createMimeMessage()).thenReturn(mimeMessage);

        when(notificationRepository.save(any(EmailNotification.class))).thenAnswer(i -> i.getArguments()[0]);

        EmailNotification saved = emailService.sendEmail(notification);

        assertEquals("SENT", saved.getStatus());
        verify(mailSender).send(mimeMessage);
    }
}
