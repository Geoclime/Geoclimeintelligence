# Database ERD — Rivers State Climate & Disaster Management Platform

Entity-relationship diagram for the PostgreSQL/PostGIS schema. Rendered natively by GitHub/GitLab from the `mermaid` block below.

## Entity Relationship Diagram

```mermaid
erDiagram
    COUNTRIES ||--o{ ADMIN_UNITS : has
    ADMIN_UNITS ||--o{ ADMIN_UNITS : "has sub-unit"
    ADMIN_UNITS ||--o{ SETTLEMENT_POINTS : has
    ADMIN_UNITS ||--o{ SETTLEMENT_EXTENTS : has
    ADMIN_UNITS ||--o{ BUILDINGS : contains
    ADMIN_UNITS ||--o{ INFRASTRUCTURE : contains
    ADMIN_UNITS ||--o{ DISASTER_EVENTS : "occurred in"
    ADMIN_UNITS ||--o{ RAINFALL_OBSERVATIONS : "measured for"
    ADMIN_UNITS ||--o{ POPULATION_ESTIMATES : "estimated for"
    ADMIN_UNITS ||--o{ USERS : "scopes access for"
    COUNTRIES ||--o{ ROADS : has
    COUNTRIES ||--o{ WATERWAYS : has
    COUNTRIES ||--o{ FLOOD_SUSCEPTIBILITY_ZONES : has
    DISASTER_TYPES ||--o{ DISASTER_EVENTS : classifies
    DISASTER_TYPES ||--o{ DISASTER_TYPES : "has subtype"
    ROLES ||--o{ USERS : "assigned to"

    COUNTRIES {
        text country_code PK "ISO 3166-1 alpha-3, e.g. NGA"
        text country_name
        geometry geom "MultiPolygon, SRID 4326, nullable until pulled"
        uuid source_id FK
    }
    ADMIN_UNITS {
        uuid admin_unit_id PK
        text country_code FK
        uuid parent_id FK "nullable, self-referencing"
        smallint level "1=state/region, 2=LGA-equivalent, 3=ward-equivalent"
        text level_name "country's own term: State / LGA / Ward for Nigeria"
        text unit_name
        text unit_code "source pcode, e.g. OCHA ADM2_PCODE — not globally unique alone"
        geometry geom "Polygon or MultiPolygon, SRID 4326"
        uuid source_id FK
    }
    SETTLEMENT_POINTS {
        uuid settlement_id PK
        uuid admin_unit_id FK
        text source_settlement_code "e.g. GRID3 set_id"
        text settlement_name
        geometry geom "Point, SRID 4326"
        uuid source_id FK
    }
    SETTLEMENT_EXTENTS {
        uuid settlement_id PK "same id as SETTLEMENT_POINTS"
        uuid admin_unit_id FK
        geometry geom "Polygon, SRID 4326"
        uuid source_id FK
    }
    ROADS {
        uuid road_id PK
        text country_code FK
        text name
        text road_class
        geometry geom "LineString, SRID 4326"
        uuid source_id FK
    }
    WATERWAYS {
        uuid waterway_id PK
        text country_code FK
        text name
        text waterway_type "river / creek"
        geometry geom "LineString or Polygon, SRID 4326"
        uuid source_id FK
    }
    BUILDINGS {
        uuid building_id PK
        uuid admin_unit_id FK
        text country_code FK
        geometry geom "Polygon, SRID 4326"
        uuid source_id FK
    }
    INFRASTRUCTURE {
        uuid infrastructure_id PK
        uuid admin_unit_id FK
        text country_code FK
        text name
        text facility_type "hospital / school / market / government"
        geometry geom "Point, SRID 4326"
        uuid source_id FK
    }
    DISASTER_TYPES {
        smallint disaster_type_id PK
        smallint parent_type_id FK "nullable, self-referencing"
        text type_name
    }
    DISASTER_EVENTS {
        uuid event_id PK
        smallint disaster_type_id FK
        uuid admin_unit_id FK
        text country_code FK
        date event_date
        text community
        text severity
        int affected_population
        int fatalities
        numeric economic_damage
        geometry geom "Point, SRID 4326, nullable"
        text data_type "OBSERVED/DERIVED/MODELLED/ESTIMATED/SYNTHETIC, mandatory"
        text confidence_level
        uuid source_id FK
    }
    FLOOD_SUSCEPTIBILITY_ZONES {
        uuid zone_id PK
        text country_code FK
        text risk_level
        geometry geom "Polygon, SRID 4326"
        text data_type "DERIVED"
        text methodology
        uuid source_id FK
    }
    RAINFALL_OBSERVATIONS {
        uuid rainfall_id PK
        uuid admin_unit_id FK
        text country_code FK
        text year_month "YYYY-MM"
        numeric mean_rainfall_mm "nullable for an incomplete current month"
        text data_type "OBSERVED"
        uuid source_id FK
    }
    POPULATION_ESTIMATES {
        uuid population_id PK
        uuid admin_unit_id FK
        text country_code FK
        smallint year
        numeric total_population
        text data_type "MODELLED"
        text method
        uuid source_id FK
    }
    DATA_SOURCES {
        uuid source_id PK
        text provider
        text dataset_name
        text url
        text license
        text coverage_scope "e.g. Nigeria - Rivers State, Nigeria - National, Global"
        date last_updated
        text reliability "HIGH/MEDIUM/LOW/UNKNOWN"
    }
    ROLES {
        smallint role_id PK
        text role_name
        text description
    }
    USERS {
        uuid user_id PK
        text firebase_uid UK "unique, NOT NULL — Firebase Authentication's identity for this user; no password is ever stored here"
        smallint role_id FK
        uuid scope_admin_unit_id FK "nullable — null means unrestricted access"
        text name
        text email
    }
```

## Notes

- **Coordinate reference system:** every `geometry` column is `SRID 4326` (WGS84), matching GPS and every external dataset the platform ingests.
- **`data_type`** (`OBSERVED` / `DERIVED` / `MODELLED` / `ESTIMATED` / `SYNTHETIC`) is mandatory on every data-bearing table — the platform never presents an estimate as an observed measurement. See the Backend Engineering Standards doc for the full data-integrity discipline.
- **Authentication:** identity is handled entirely by Firebase Authentication. `USERS.firebase_uid` is the only link to that identity; this database never stores a password or password hash. `role_id` and `scope_admin_unit_id` are the platform's own authorization data, resolved server-side on first sight of a verified Firebase user.
- **`ADMIN_UNITS`** is self-referencing (`parent_id`) to represent Nigeria's State → LGA → Ward hierarchy (and any other country's equivalent) without a fixed-depth table per level.
- Full architecture, rationale, and the rest of the schema's context: see the *Rivers State Platform — Approach, Architecture & Backlog* doc.
