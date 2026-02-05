
$baseUrl = "http://localhost:3000/api/clients"

$clients = @(
    @{ name = "أحمد السيد"; email = "ahmed.alsayed@example.com"; phone = "+20 10 1234 5678"; alternate_phone = "+20 11 9876 5432"; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1001"; date_of_birth = "1985-04-12"; profession = "محامي"; company = "السيد وشركاه"; tax_id = "EG123456789"; notes = @("عميل VIP"); join_date = "2026-01-05" },
    @{ name = "فاطمة حسن"; email = "fatima.hassan@example.com"; phone = "+20 10 2345 6789"; alternate_phone = ""; address = "شارع التحرير، القاهرة"; status = "active"; cin = "EG1002"; date_of_birth = "1978-09-23"; profession = "محاسب"; company = "استشارات حسن"; tax_id = "EG987654321"; notes = @(); join_date = "2026-01-03" },
    @{ name = "سارة محمود"; email = "sara.mahmoud@example.com"; phone = "+20 10 3456 7890"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1003"; date_of_birth = "1990-01-15"; profession = "مهندسة"; company = "تكنولوجيا الابتكار"; tax_id = "EG192837465"; notes = @(); join_date = "2026-01-07" },
    @{ name = "محمد علي"; email = "mohamed.ali@example.com"; phone = "+20 10 4567 8901"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1004"; date_of_birth = "1982-07-30"; profession = "طبيب"; company = "عيادة علي"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-02" },
    @{ name = "لينا عبدالله"; email = "layla.abdullah@example.com"; phone = "+20 10 5678 9012"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1005"; date_of_birth = "1992-11-08"; profession = "مهندس معماري"; company = "تصميم عبدالله"; tax_id = "EG837261945"; notes = @(); join_date = "2026-01-06" },
    @{ name = "عمر خالد"; email = "omar.khaled@example.com"; phone = "+20 10 6789 0123"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1006"; date_of_birth = "1988-03-19"; profession = "استشاري"; company = "استشارات خالد"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-08" },
    @{ name = "نور الدين"; email = "nour.aldin@example.com"; phone = "+20 10 7890 1234"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1007"; date_of_birth = "1983-06-25"; profession = "معلم"; company = "مدرسة الهرم"; tax_id = "EG918273645"; notes = @(); join_date = "2026-01-03" },
    @{ name = "يوسف إبراهيم"; email = "youssef.ibrahim@example.com"; phone = "+20 10 8901 2345"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1008"; date_of_birth = "1975-12-02"; profession = "رجل أعمال"; company = "إبراهيم ش.م.م"; tax_id = "EG564738291"; notes = @(); join_date = "2025-12-20" },
    @{ name = "مريم أحمد"; email = "mariam.ahmed@example.com"; phone = "+20 10 9012 3456"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1009"; date_of_birth = "1986-05-14"; profession = "مدير موارد بشرية"; company = "موارد أحمد"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-02" },
    @{ name = "علي حسن"; email = "ali.hassan@example.com"; phone = "+20 10 0123 4567"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1010"; date_of_birth = "1995-10-21"; profession = "طالب"; company = ""; tax_id = ""; notes = @(); join_date = "2026-01-06" },
    @{ name = "هدى سالم"; email = "hoda.salem@example.com"; phone = "+20 10 1234 5678"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1011"; date_of_birth = "1981-02-17"; profession = "صيدلي"; company = "صيدلية سالم"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-08" },
    @{ name = "كريم محمود"; email = "karim.mahmoud@example.com"; phone = "+20 10 2345 6789"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1012"; date_of_birth = "1979-08-29"; profession = "مصرفي"; company = "بنك محمود"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-03" },
    @{ name = "فاطمة يوسف"; email = "fatima.youssef@example.com"; phone = "+20 10 3456 7890"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1013"; date_of_birth = "1987-04-05"; profession = "مصممة"; company = "تصميم يوسف"; tax_id = "EG564738291"; notes = @(); join_date = "2025-12-15" },
    @{ name = "أحمد عبدالرحمن"; email = "ahmed.abdelrahman@example.com"; phone = "+20 10 4567 8901"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1014"; date_of_birth = "1984-12-11"; profession = "فنان"; company = ""; tax_id = ""; notes = @(); join_date = "2026-01-02" },
    @{ name = "ليلى محمد"; email = "layla.mohamed@example.com"; phone = "+20 10 5678 9012"; alternate_phone = ""; address = "شارع الهرم، الجيزة"; status = "active"; cin = "EG1015"; date_of_birth = "1993-03-27"; profession = "استشارية"; company = "استشارات محمد"; tax_id = "EG564738291"; notes = @(); join_date = "2026-01-06" }
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