package com.jewelry.backend.service.notification;

import com.jewelry.backend.entity.Appointment;
import com.jewelry.backend.repository.AppointmentRepository;
import com.jewelry.backend.repository.NotificationLogRepository;
import com.jewelry.backend.service.AppointmentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Daily at 09:00: APPOINTMENT_REMINDER for every appointment requested
 * tomorrow that is not cancelled or done. "Once per appointment" is enforced
 * through the notification log (event + appointment id), so a restart or a
 * second node cannot double-send.
 */
@Component
public class AppointmentReminderJob {

    private static final Logger LOGGER = Logger.getLogger(AppointmentReminderJob.class.getName());

    @Autowired
    AppointmentRepository appointmentRepository;

    @Autowired
    NotificationLogRepository notificationLogRepository;

    @Autowired
    NotificationService notificationService;

    @Autowired
    AppointmentService appointmentService;

    @Scheduled(cron = "0 0 9 * * *")
    public void sendReminders() {
        try {
            LocalDate tomorrow = LocalDate.now().plusDays(1);
            List<Appointment> due = appointmentRepository.findByRequestedDateBetween(
                    tomorrow.atStartOfDay(), tomorrow.atTime(23, 59, 59));
            int sent = 0;
            for (Appointment a : due) {
                if (!eligible(a)) {
                    continue;
                }
                String reference = "APPT-" + a.getId();
                if (notificationLogRepository.existsByEventAndReference(NotificationEvent.APPOINTMENT_REMINDER.name(), reference)) {
                    continue;
                }
                notificationService.notify(NotificationEvent.APPOINTMENT_REMINDER,
                        Recipient.guest(a.getName(), a.getEmail(), a.getPhone(), reference),
                        appointmentService.params(a));
                sent++;
            }
            if (sent > 0) {
                LOGGER.info("Appointment reminders: " + sent + " sent for " + tomorrow);
            }
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Appointment reminder run failed", e);
        }
    }

    static boolean eligible(Appointment a) {
        if (a == null || a.getRequestedDate() == null) {
            return false;
        }
        String status = a.getStatus() == null ? "" : a.getStatus().trim().toUpperCase(Locale.ROOT);
        return !status.equals("CANCELLED") && !status.equals("COMPLETED") && !status.equals("DECLINED") && !status.equals("NO_SHOW");
    }
}
