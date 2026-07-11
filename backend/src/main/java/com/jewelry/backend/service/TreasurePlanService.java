package com.jewelry.backend.service;

import com.jewelry.backend.dto.TreasureEnrollRequest;
import com.jewelry.backend.dto.TreasurePlanConfigDTO;
import com.jewelry.backend.entity.TreasureChestAccount;
import com.jewelry.backend.entity.User;
import com.jewelry.backend.repository.TreasureChestAccountRepository;
import com.jewelry.backend.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;

@Service
public class TreasurePlanService {

    @Autowired
    TreasureChestAccountRepository treasureChestAccountRepository;

    @Autowired
    UserRepository userRepository;

    public TreasurePlanConfigDTO getConfig() {
        TreasurePlanConfigDTO config = new TreasurePlanConfigDTO();
        config.setMinAmount(new BigDecimal("1000"));
        config.setMaxAmount(new BigDecimal("100000"));
        config.setDurationMonths(11);
        config.setBonusMonths(1);
        return config;
    }

    public TreasureChestAccount getAccount(String userEmail) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();
        return treasureChestAccountRepository.findByUser(user)
                .orElseThrow(() -> new RuntimeException("Account not found"));
    }

    public Iterable<TreasureChestAccount> getAllAccounts() {
        return treasureChestAccountRepository.findAll();
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount recordPayment(java.util.UUID id) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id).orElseThrow();
        account.setInstallmentsPaid(account.getInstallmentsPaid() + 1);
        account.setCurrentBalance(account.getCurrentBalance().add(account.getInstallmentAmount()));
        account.setNextDueDate(account.getNextDueDate().plusMonths(1));
        return treasureChestAccountRepository.save(account);
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount skipMonth(java.util.UUID id) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id).orElseThrow();
        account.setNextDueDate(account.getNextDueDate().plusMonths(1));
        return treasureChestAccountRepository.save(account);
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount closePlan(java.util.UUID id) {
        TreasureChestAccount account = treasureChestAccountRepository.findById(id).orElseThrow();
        account.setStatus("CLOSED");
        return treasureChestAccountRepository.save(account);
    }

    @Transactional(rollbackFor = Exception.class)
    public TreasureChestAccount enroll(String userEmail, TreasureEnrollRequest request) {
        User user = userRepository.findByEmail(userEmail).orElseThrow();

        if (treasureChestAccountRepository.findByUser(user).isPresent()) {
            throw new RuntimeException("User already enrolled");
        }

        TreasureChestAccount account = new TreasureChestAccount();
        account.setUser(user);
        account.setPlanName(request.getPlanName());
        account.setInstallmentAmount(request.getInstallmentAmount());
        account.setCurrentBalance(BigDecimal.ZERO);
        account.setStatus("ACTIVE");
        account.setStartDate(LocalDate.now());
        account.setInstallmentsPaid(0);
        account.setTotalInstallments(12); // Assume 12 for now
        account.setNextDueDate(LocalDate.now().plusMonths(1));

        return treasureChestAccountRepository.save(account);
    }
}
