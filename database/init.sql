CREATE DATABASE IF NOT EXISTS skin_disease_db;
USE skin_disease_db;

CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT UNIQUE,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) PRIMARY KEY ,
    password VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255) DEFAULT NULL,
    reset_code VARCHAR(6),
    reset_code_expires DATETIME
);

CREATE TABLE IF NOT EXISTS images (
    image_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    capture_method ENUM('Camera','Gallery') NOT NULL,
    image_path VARCHAR(255) NOT NULL,
    upload_date DATE NOT NULL,
    upload_time TIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diseases (
    disease_id INT PRIMARY KEY,
    disease_name VARCHAR(100) NOT NULL UNIQUE
);

INSERT INTO diseases (disease_id, disease_name) VALUES
(0, 'Other'),
(1, 'Ringworm'),
(2, 'Tinea Cruris'),
(3, 'Tinea Versicolor')
ON DUPLICATE KEY UPDATE disease_name=VALUES(disease_name);

CREATE TABLE IF NOT EXISTS detections (
    detection_id INT AUTO_INCREMENT PRIMARY KEY,
    image_id INT NOT NULL UNIQUE,
    disease_id INT NOT NULL,
    disease_class VARCHAR(100) NOT NULL,
    confidence_score DECIMAL(5,2) NOT NULL,
    detection_date DATE NOT NULL,
    detection_time TIME NOT NULL,
    FOREIGN KEY (image_id) REFERENCES images(image_id) ON DELETE CASCADE,
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id)
);

CREATE TABLE IF NOT EXISTS heatmaps (
    heatmap_id INT AUTO_INCREMENT PRIMARY KEY,
    detection_id INT NOT NULL UNIQUE,
    heat_map_status ENUM('Generated','Pending','Failed') DEFAULT 'Pending',
    heatmap_path VARCHAR(255),
    generated_date DATE,
    generated_time TIME,
    FOREIGN KEY (detection_id) REFERENCES detections(detection_id) ON DELETE CASCADE
);
