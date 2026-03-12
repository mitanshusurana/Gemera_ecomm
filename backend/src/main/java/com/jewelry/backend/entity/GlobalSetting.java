package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "global_settings")
@Data
@EqualsAndHashCode(callSuper = true)
public class GlobalSetting extends BaseEntity {
    private String settingKey;
    private String settingValue;
}
