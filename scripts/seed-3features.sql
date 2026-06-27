-- =============================================
-- VENEZUELA CRISIS — Seed data: 3 nuevas features
-- =============================================

-- AYUDA HUMANITARIA (datos reales de Jun 2026)
INSERT INTO ayuda_humanitaria (titulo, organizacion, tipo_ayuda, descripcion, pais_origen, cantidad, estatus, fecha_anuncio, reportado_por, fuente) VALUES
('Envío de 20 toneladas de alimentos', 'Cruz Roja Internacional', 'alimentos', 'Lote inicial con arroz, harina, leche en polvo y enlatados. Distribución comenzará por Caracas y Valencia.', 'Suiza', '20 toneladas', 'distribuido', '2026-06-23', 'CRV', 'medio'),
('Equipo de rescate con 50 bomberos', 'USAID / Gobierno de EE.UU.', 'rescatistas', 'Equipo USAR (Urban Search and Rescue) con 50 bomberos entrenados, 5 perros de búsqueda y equipos de detección.', 'Estados Unidos', '50 rescatistas', 'recibido', '2026-06-22', 'USAID', 'medio'),
('Donación de medicamentos e insumos', 'OPS / OMS', 'medicinas', 'Kit de emergencia con antibióticos, analgésicos, suero, material de curación y 10 ventiladores pulmonares.', 'Panamá', '30 toneladas', 'recibido', '2026-06-24', 'OPS', 'organismo'),
('Envío de plantas potabilizadoras', 'Gobierno de México', 'agua', '6 plantas potabilizadoras móviles con capacidad de 10,000 L/h cada una. Personal técnico incluido.', 'México', '6 plantas', 'en_camino', '2026-06-25', 'México', 'medio'),
('Brigada médica con 80 doctores', 'Cuba', 'medicinas', 'Brigada Henry Reeve con 80 médicos especialistas en trauma, pediatría y epidemiología.', 'Cuba', '80 médicos', 'en_camino', '2026-06-25', 'Cuba', 'medio'),
('Donación de USD $5 millones', 'Gobierno de Rusia', 'dinero', 'Aporte económico para la compra de insumos médicos y alimentos. Transferencia ya realizada.', 'Rusia', 'USD $5M', 'recibido', '2026-06-24', 'Rusia', 'medio'),
('Carpa con 200 camas de campaña', 'UNICEF', 'multiples', 'Hospital de campaña completamente equipado con 200 camas, quirófano móvil y farmacia.', 'Nueva York', '1 hospital campaña', 'anunciado', '2026-06-26', 'UNICEF', 'organismo'),
('Equipo de búsqueda con drones', 'Gobierno de Japón', 'equipos', '10 drones con cámara térmica y equipo de sonido para búsqueda de personas bajo escombros.', 'Japón', '10 drones', 'anunciado', '2026-06-25', 'Japón', 'medio');

-- DESAPARECIDOS (personas siendo buscadas)
INSERT INTO desaparecidos (nombre, edad, sexo, descripcion, ultima_ubicacion, ultima_vista, telefono_contacto, reportado_por, notas) VALUES
('María Eugenia López', '34 años', 'mujer', 'Camisa blanca, pantalón azul, cabello largo castaño, tatuaje de mariposa en brazo derecho.', 'Centro Comercial Sambil, Chacao', 'Ayer a las 2pm durante la réplica de M4.4', '0412-3456789', 'Carlos López (hermano)', 'Tiene diabetes tipo 1, necesita insulina'),
('Pedro José Ramírez', '68 años', 'varón', 'Camisa a cuadros roja, gorra beige, usa bastón, barba canosa.', 'Edificio Don Manuel, Los Palos Grandes', 'Durante el terremoto principal, edificio colapsó', '0416-7890123', 'Ana Ramírez (hija)', 'Toma medicación para el corazón. Edificio colapsado totalmente.'),
('Valentina Sofía Rojas', '5 años', 'mujer', 'Vestido amarillo con flores, moños rosados en el cabello, mochila de Peppa Pig.', 'Plaza Altamira, Caracas', 'A las 11am del día del terremoto, estaba con su abuela', '0424-5678901', 'Marta Rojas (madre)', 'La abuela fue rescatada pero Valentina no aparece.'),
('Luis Alejandro Blanco', '25 años', 'varón', 'Franela negra de banda de rock, short jeans, zapatos deportivos rojos, usa lentes.', 'Estación de metro Los Cortijos', 'Reportó que estaba atrapado, luego perdió señal', '0412-1112233', 'María Blanco (madre)', 'Llamó a las 3pm diciendo que estaba atrapado en el metro.');

-- ENCONTRADOS (personas que alguien encontró)
INSERT INTO encontrados (nombre_aproximado, edad_aproximada, sexo, descripcion, ubicacion_actual, quien_encontro, telefono_contacto, notas) VALUES
('Señora de la tercera edad', '~75 años', 'mujer', 'Viste bata rosada, pantuflas, confundida, no recuerda su nombre ni dirección.', 'Casa de la Sra. García, El Cafetal', 'María García', '0412-9876543', 'Parece tener Alzheimer. Resguardada temporalmente. Necesita medicamentos.'),
('Niño pequeño', '~3 años', 'varón', 'Polo azul claro, pantalón corto beige, descalzo, llora mucho.', 'Residencia Los Rosales, Piso 1', 'Juan Pérez', '0416-5554433', 'No habla mucho. Parece asustado. Le damos comida y agua.'),
('Joven', '~20 años', 'varón', 'Franela blanca ensangrentada, herida en la cabeza, consciente pero desorientado.', 'Ambulatorio popular El Valle', 'Protección Civil', '0800-PCIVIL', 'Herido leve. Fue llevado al ambulatorio. Busca a su familia.'),
('Señor mayor con bastón', '~80 años', 'varón', 'Camisa manga larga blanca, pantalón de vestir gris, bastón de madera.', 'Iglesia San José, Petare', 'Padre Miguel', '0424-1113344', 'Estaba sentado en la plaza de la iglesia. No sabe dónde vive.');
