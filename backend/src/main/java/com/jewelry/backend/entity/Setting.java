package com.jewelry.backend.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Entity
@Table(name = "settings")
@Data
@EqualsAndHashCode(callSuper = true)
public class Setting extends BaseEntity {
    private String keyName;
    private String value;
}
