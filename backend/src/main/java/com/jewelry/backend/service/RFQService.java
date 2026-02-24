package com.jewelry.backend.service;

import com.jewelry.backend.dto.NegotiationRequestDTO;
import com.jewelry.backend.entity.RFQ;
import com.jewelry.backend.entity.RFQItem;
import com.jewelry.backend.entity.RFQQuote;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.RFQQuoteRepository;
import com.jewelry.backend.repository.RFQRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

@Service
public class RFQService {

    @Autowired
    RFQRepository rfqRepository;

    @Autowired
    RFQQuoteRepository rfqQuoteRepository;

    @Autowired
    UserRepository userRepository;

    @Transactional
    public RFQ createRequest(String userEmail, RFQ rfq) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        rfq.setUser(user);
        rfq.setStatus("PENDING");
        // BaseEntity auditing handles createdAt, but for immediate use we might set it if needed.
        // Spring Data JPA auditing works on save.

        rfq.setRfqNumber("RFQ-" + System.currentTimeMillis() + "-" + new Random().nextInt(1000));

        if (rfq.getItems() != null) {
            for (RFQItem item : rfq.getItems()) {
                item.setRfq(rfq);
            }
        }

        return rfqRepository.save(rfq);
    }

    public RFQ getRequest(UUID id) {
        return rfqRepository.findById(id).orElseThrow(() -> new RuntimeException("RFQ not found"));
    }

    public RFQ getRequestByNumber(String rfqNumber) {
        return rfqRepository.findByRfqNumber(rfqNumber).orElseThrow(() -> new RuntimeException("RFQ not found"));
    }

    public Page<RFQ> getUserRequests(UUID userId, String status, Pageable pageable) {
        User user = userRepository.findById(userId).orElseThrow(() -> new RuntimeException("User not found"));
        if (status != null && !status.isEmpty()) {
            return rfqRepository.findByUserAndStatus(user, status, pageable);
        }
        return rfqRepository.findByUser(user, pageable);
    }

    @Transactional
    public RFQ updateRequest(UUID id, Map<String, Object> updates) {
        RFQ rfq = getRequest(id);
        if (updates.containsKey("companyName")) rfq.setCompanyName((String) updates.get("companyName"));
        if (updates.containsKey("additionalNotes")) rfq.setAdditionalNotes((String) updates.get("additionalNotes"));
        if (updates.containsKey("email")) rfq.setEmail((String) updates.get("email"));
        if (updates.containsKey("deliveryTimeline")) rfq.setDeliveryTimeline((String) updates.get("deliveryTimeline"));

        return rfqRepository.save(rfq);
    }

    @Transactional
    public void cancelRequest(UUID id) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("CANCELLED");
        rfqRepository.save(rfq);
    }

    public RFQQuote getLatestQuote(UUID id) {
        RFQ rfq = getRequest(id);
        return rfq.getQuotes().stream()
                .filter(q -> q.getCreatedAt() != null)
                .max(Comparator.comparing(RFQQuote::getCreatedAt))
                .orElse(rfq.getQuotes().isEmpty() ? null : rfq.getQuotes().get(0));
    }

    public Page<RFQQuote> getAllQuotes(UUID id, Pageable pageable) {
        RFQ rfq = getRequest(id);
        return rfqQuoteRepository.findByRfq(rfq, pageable);
    }

    public byte[] generateQuotePdf(UUID id) {
        return "Mock PDF Content".getBytes();
    }

    @Transactional
    public void acceptQuote(UUID id) {
        RFQ rfq = getRequest(id);
        RFQQuote quote = getLatestQuote(id);
        if (quote != null) {
            quote.setAccepted(true);
            rfqQuoteRepository.save(quote);
        }
        rfq.setStatus("ACCEPTED");
        rfqRepository.save(rfq);
    }

    @Transactional
    public void rejectQuote(UUID id, String reason) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("REJECTED");
        // Could log reason to a history table or update additionalNotes
        if (reason != null && !reason.isEmpty()) {
            rfq.setAdditionalNotes(rfq.getAdditionalNotes() + "\nRejection Reason: " + reason);
        }
        rfqRepository.save(rfq);
    }

    @Transactional
    public void negotiate(UUID id, NegotiationRequestDTO request) {
        RFQ rfq = getRequest(id);
        rfq.setStatus("NEGOTIATING");
        if (request.getNotes() != null) {
            rfq.setAdditionalNotes(rfq.getAdditionalNotes() + "\nNegotiation: " + request.getNotes());
        }
        rfqRepository.save(rfq);
    }
}
