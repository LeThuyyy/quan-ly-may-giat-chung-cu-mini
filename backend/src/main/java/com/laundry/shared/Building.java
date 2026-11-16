package com.laundry.shared;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "buildings")
public class Building {
    @Id private UUID id;
    @Column(nullable = false, length = 100) private String name;
    @ManyToOne(optional = false, fetch = FetchType.LAZY) private Account manager;

    protected Building() {}
    public Building(String name, Account manager) {
        this.id = UUID.randomUUID();
        this.name = name;
        this.manager = manager;
    }
    public UUID getId() { return id; }
    public String getName() { return name; }
    public UUID getManagerId() { return manager.getId(); }
}
