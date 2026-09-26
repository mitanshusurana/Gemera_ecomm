package com.jewelry.backend.service.notification;

import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.repository.NotificationLogRepository;
import com.jewelry.backend.util.EmailText;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Daily at 09:30: TREASURE_INSTALLMENT_DUE for every active Treasure Chest
 * account whose next installment falls due in three days. Reads the accounts
 * through a JPQL query so the Treasure* classes stay untouched; the account's
 * id plus due date form the log reference, so each due date is reminded once.
 */
@Component
public class TreasureReminderJob {

    private static final Logger LOGGER = Logger.getLogger(TreasureReminderJob.class.getName());
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy");
    static final int DAYS_AHEAD = 3;

    @PersistenceContext
    EntityManager entityManager;

    @Autowired
    NotificationLogRepository notificationLogRepository;

    @Autowired
    NotificationService notificationService;

    @Value("${app.frontend-url:http://localhost:4200}")
    private String frontendUrl;

    /** Not read-only: the log rows and e-mail audit rows written by notify() must flush. */
    @Scheduled(cron = "0 30 9 * * *")
    @Transactional
    public void sendReminders() {
        try {
            LocalDate dueDate = LocalDate.now().plusDays(DAYS_AHEAD);
            List<TreasureChestAccount> accounts = entityManager.createQuery(
                            "SELECT a FROM TreasureChestAccount a WHERE a.nextDueDate = :due AND UPPER(a.status) = 'ACTIVE'",
                            TreasureChestAccount.class)
                    .setParameter("due", dueDate)
                    .getResultList();
            int sent = 0;
            for (TreasureChestAccount account : accounts) {
                if (account.getUser() == null) {
                    continue;
                }
                String reference = "TREASURE-" + account.getId() + "-" + dueDate;
                if (notificationLogRepository.existsByEventAndReference(NotificationEvent.TREASURE_INSTALLMENT_DUE.name(), reference)) {
                    continue;
                }
                Map<String, String> data = new HashMap<>();
                Recipient recipient = Recipient.of(account.getUser(), reference);
                data.put("customerName", EmailText.escape(recipient.name()));
                data.put("planName", EmailText.escape(account.getPlanName() == null ? "Treasure Chest" : account.getPlanName()));
                data.put("amount", EmailText.inr(account.getInstallmentAmount()));
                data.put("dueDate", dueDate.format(DATE));
                data.put("balance", EmailText.inr(account.getCurrentBalance()));
                data.put("installmentNumber", String.valueOf(account.getInstallmentsPaid() + 1));
                data.put("totalInstallments", String.valueOf(account.getTotalInstallments()));
                data.put("storefrontUrl", EmailText.trimSlash(frontendUrl));
                notificationService.notify(NotificationEvent.TREASURE_INSTALLMENT_DUE, recipient, data);
                sent++;
            }
            if (sent > 0) {
                LOGGER.info("Treasure installment reminders: " + sent + " sent for " + dueDate);
            }
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Treasure installment reminder run failed", e);
        }
    }
}
