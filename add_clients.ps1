
$baseUrl = "http://localhost:3000/api/clients"

$clients = @(
    @{ name = "Alice Dupont"; email = "alice.dupont@example.com"; phone = "+33 1 23 45 67 01"; alternate_phone = "+33 6 12 34 56 78"; address = "12 rue de la Paix, Paris"; status = "active"; cin = "ID1001"; date_of_birth = "1985-04-12"; profession = "Lawyer"; company = "Dupont & Partners"; tax_id = "FR123456789"; notes = "VIP client"; join_date = "2026-01-05" },
    @{ name = "Bernard Martin"; email = "bernard.martin@example.com"; phone = "+33 1 23 45 67 02"; alternate_phone = ""; address = "34 avenue Victor Hugo, Lyon"; status = "active"; cin = "ID1002"; date_of_birth = "1978-09-23"; profession = "Accountant"; company = "Martin Conseil"; tax_id = "FR987654321"; notes = ""; join_date = "2026-01-03" },
    @{ name = "Claire Dubois"; email = "claire.dubois@example.com"; phone = "+33 1 23 45 67 03"; alternate_phone = ""; address = "56 boulevard Saint-Germain, Paris"; status = "active"; cin = "ID1003"; date_of_birth = "1990-01-15"; profession = "Engineer"; company = "Tech Innov"; tax_id = "FR192837465"; notes = ""; join_date = "2026-01-07" },
    @{ name = "David Lefevre"; email = "david.lefevre@example.com"; phone = "+33 1 23 45 67 04"; alternate_phone = ""; address = "78 rue Nationale, Lille"; status = "active"; cin = "ID1004"; date_of_birth = "1982-07-30"; profession = "Doctor"; company = "Lefevre Clinic"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-02" },
    @{ name = "Emma Moreau"; email = "emma.moreau@example.com"; phone = "+33 1 23 45 67 05"; alternate_phone = ""; address = "90 rue de la République, Marseille"; status = "active"; cin = "ID1005"; date_of_birth = "1992-11-08"; profession = "Architect"; company = "Moreau Design"; tax_id = "FR837261945"; notes = ""; join_date = "2026-01-06" },
    @{ name = "François Petit"; email = "francois.petit@example.com"; phone = "+33 1 23 45 67 06"; alternate_phone = ""; address = "23 rue des Fleurs, Nice"; status = "active"; cin = "ID1006"; date_of_birth = "1988-03-19"; profession = "Consultant"; company = "Petit Conseil"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-08" },
    @{ name = "Gabrielle Laurent"; email = "gabrielle.laurent@example.com"; phone = "+33 1 23 45 67 07"; alternate_phone = ""; address = "45 avenue Jean Jaurès, Toulouse"; status = "active"; cin = "ID1007"; date_of_birth = "1983-06-25"; profession = "Teacher"; company = "Lycée Toulouse"; tax_id = "FR918273645"; notes = ""; join_date = "2026-01-03" },
    @{ name = "Hugo Girard"; email = "hugo.girard@example.com"; phone = "+33 1 23 45 67 08"; alternate_phone = ""; address = "67 rue du Port, Bordeaux"; status = "active"; cin = "ID1008"; date_of_birth = "1975-12-02"; profession = "Entrepreneur"; company = "Girard SARL"; tax_id = "FR564738291"; notes = ""; join_date = "2025-12-20" },
    @{ name = "Isabelle Renault"; email = "isabelle.renault@example.com"; phone = "+33 1 23 45 67 09"; alternate_phone = ""; address = "12 rue des Lilas, Nantes"; status = "active"; cin = "ID1009"; date_of_birth = "1986-05-14"; profession = "HR Manager"; company = "Renault RH"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-02" },
    @{ name = "Julien Faure"; email = "julien.faure@example.com"; phone = "+33 1 23 45 67 10"; alternate_phone = ""; address = "89 avenue de la Gare, Strasbourg"; status = "active"; cin = "ID1010"; date_of_birth = "1995-10-21"; profession = "Student"; company = ""; tax_id = ""; notes = ""; join_date = "2026-01-06" },
    @{ name = "Karine Blanchard"; email = "karine.blanchard@example.com"; phone = "+33 1 23 45 67 11"; alternate_phone = ""; address = "34 rue du Marché, Montpellier"; status = "active"; cin = "ID1011"; date_of_birth = "1981-02-17"; profession = "Pharmacist"; company = "Pharma Blanchard"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-08" },
    @{ name = "Louis Chevalier"; email = "louis.chevalier@example.com"; phone = "+33 1 23 45 67 12"; alternate_phone = ""; address = "56 avenue de la Liberté, Rennes"; status = "active"; cin = "ID1012"; date_of_birth = "1979-08-29"; profession = "Banker"; company = "Banque Chevalier"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-03" },
    @{ name = "Marie Lambert"; email = "marie.lambert@example.com"; phone = "+33 1 23 45 67 13"; alternate_phone = ""; address = "78 rue de la Mer, Brest"; status = "active"; cin = "ID1013"; date_of_birth = "1987-04-05"; profession = "Designer"; company = "Lambert Design"; tax_id = "FR564738291"; notes = ""; join_date = "2025-12-15" },
    @{ name = "Nicolas Marchand"; email = "nicolas.marchand@example.com"; phone = "+33 1 23 45 67 14"; alternate_phone = ""; address = "23 rue des Arts, Dijon"; status = "active"; cin = "ID1014"; date_of_birth = "1984-12-11"; profession = "Artist"; company = ""; tax_id = ""; notes = ""; join_date = "2026-01-02" },
    @{ name = "Océane Perrin"; email = "oceane.perrin@example.com"; phone = "+33 1 23 45 67 15"; alternate_phone = ""; address = "45 avenue du Parc, Grenoble"; status = "active"; cin = "ID1015"; date_of_birth = "1993-03-27"; profession = "Consultant"; company = "Perrin Conseil"; tax_id = "FR564738291"; notes = ""; join_date = "2026-01-06" }
)

$successCount = 0
$failureCount = 0

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Adding 15 Clients to the System..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

foreach ($client in $clients) {
    try {
        $json = $client | ConvertTo-Json -Depth 4
        $response = Invoke-WebRequest -Uri $baseUrl -Method Post -ContentType "application/json" -Body $json -ErrorAction Stop
        $successCount++
        Write-Host "✓ Added: $($client.name)" -ForegroundColor Green
    }
    catch {
        $failureCount++
        Write-Host "✗ Failed: $($client.name) - $($_.Exception.Message)" -ForegroundColor Red
    }
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Summary:" -ForegroundColor Cyan
Write-Host "Success: $successCount" -ForegroundColor Green
Write-Host "Failed: $failureCount" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Cyan