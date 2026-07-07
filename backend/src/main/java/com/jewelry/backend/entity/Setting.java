package com.jewelry.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "settings")
@Data
@EqualsAndHashCode(callSuper = true)
public class Setting extends BaseEntity {
    @Column(name = "key_name")
    private String keyName;

    @Column(name = "setting_value")
    private String value;
}
