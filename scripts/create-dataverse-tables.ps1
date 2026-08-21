# One-off script to create the FPL Dataverse tables (fpl_squad, fpl_squad_player,
# fpl_recommendation_log) via the Dataverse Web API, using an az CLI access token.
# See FPL/docs/dataverse-schema.md for the schema this implements.
param(
    [string]$EnvironmentUrl = "https://orgdce3257b.crm11.dynamics.com"
)

$ErrorActionPreference = "Stop"

function Initialize-DataverseApi {
    param([string]$EnvironmentUrl)
    $token = (az account get-access-token --resource $EnvironmentUrl --query accessToken -o tsv)
    if (-not $token) { throw "Failed to get access token. Run 'az login' first." }
    $headers = @{
        "Authorization"    = "Bearer $token"
        "Content-Type"     = "application/json"
        "OData-MaxVersion" = "4.0"
        "OData-Version"    = "4.0"
        "Prefer"           = "return=representation"
    }
    $baseUrl = "$EnvironmentUrl/api/data/v9.2"
    $defaultPublisher = Invoke-RestMethod -Uri "$baseUrl/publishers?`$filter=friendlyname eq 'CDS Default Publisher'&`$select=customizationprefix" -Headers $headers
    $prefix = $defaultPublisher.value[0].customizationprefix
    return @{ Headers = $headers; BaseUrl = $baseUrl; PublisherPrefix = $prefix }
}

function Test-TableExists {
    param([string]$TableLogicalName, [string]$BaseUrl, [hashtable]$Headers)
    try {
        Invoke-RestMethod -Uri "$BaseUrl/EntityDefinitions(LogicalName='$TableLogicalName')?`$select=LogicalName" -Headers $Headers -ErrorAction Stop | Out-Null
        return $true
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) { return $false }
        throw
    }
}

function Test-ColumnExists {
    param([string]$TableLogicalName, [string]$ColumnLogicalName, [string]$BaseUrl, [hashtable]$Headers)
    try {
        Invoke-RestMethod -Uri "$BaseUrl/EntityDefinitions(LogicalName='$TableLogicalName')/Attributes(LogicalName='$ColumnLogicalName')?`$select=LogicalName" -Headers $Headers -ErrorAction Stop | Out-Null
        return $true
    } catch {
        if ($_.Exception.Response.StatusCode -eq 404) { return $false }
        throw
    }
}

function New-DataverseTableIfNotExists {
    param(
        [string]$SchemaName, [string]$DisplayName, [string]$PluralDisplayName,
        [string]$PrimaryColumnName, [string]$PrimaryColumnDisplayName,
        [string]$BaseUrl, [hashtable]$Headers
    )
    $logicalName = $SchemaName.ToLower()
    if (Test-TableExists -TableLogicalName $logicalName -BaseUrl $BaseUrl -Headers $Headers) {
        Write-Host "  [SKIP] Table '$SchemaName' already exists" -ForegroundColor Yellow
        return
    }
    Write-Host "  [CREATE] Creating table '$SchemaName'..." -ForegroundColor Cyan
    $tableDefinition = @{
        "@odata.type"            = "Microsoft.Dynamics.CRM.EntityMetadata"
        "SchemaName"             = $SchemaName
        "DisplayName"            = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = $DisplayName; "LanguageCode" = 1033 }) }
        "DisplayCollectionName"  = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = $PluralDisplayName; "LanguageCode" = 1033 }) }
        "OwnershipType"          = "UserOwned"
        "HasNotes"               = $false
        "HasActivities"          = $false
        "PrimaryNameAttribute"   = $PrimaryColumnName
        "Attributes"             = @(
            @{
                "@odata.type"   = "Microsoft.Dynamics.CRM.StringAttributeMetadata"
                "SchemaName"    = $PrimaryColumnName
                "AttributeType" = "String"
                "FormatName"    = @{ "Value" = "Text" }
                "MaxLength"     = 200
                "DisplayName"   = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = $PrimaryColumnDisplayName; "LanguageCode" = 1033 }) }
                "IsPrimaryName" = $true
            }
        )
    }
    $body = $tableDefinition | ConvertTo-Json -Depth 10
    Invoke-RestMethod -Uri "$BaseUrl/EntityDefinitions" -Method Post -Headers $Headers -Body $body | Out-Null
    Write-Host "  [OK] Table '$SchemaName' created" -ForegroundColor Green
}

function Add-DataverseColumnIfNotExists {
    param(
        [string]$TableName, [string]$SchemaName, [string]$DisplayName, [string]$Type,
        [string]$BaseUrl, [hashtable]$Headers
    )
    if (Test-ColumnExists -TableLogicalName $TableName.ToLower() -ColumnLogicalName $SchemaName.ToLower() -BaseUrl $BaseUrl -Headers $Headers) {
        Write-Host "    [SKIP] Column '$SchemaName' already exists on '$TableName'" -ForegroundColor Yellow
        return
    }
    $columnTypes = @{
        "Integer"  = @{ "@odata.type" = "Microsoft.Dynamics.CRM.IntegerAttributeMetadata"; "AttributeType" = "Integer"; "MinValue" = -2147483648; "MaxValue" = 2147483647; "Format" = "None" }
        "Boolean"  = @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanAttributeMetadata"; "AttributeType" = "Boolean"; "DefaultValue" = $false; "OptionSet" = @{ "@odata.type" = "Microsoft.Dynamics.CRM.BooleanOptionSetMetadata"; "TrueOption" = @{ "Value" = 1; "Label" = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = "Yes"; "LanguageCode" = 1033 }) } }; "FalseOption" = @{ "Value" = 0; "Label" = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = "No"; "LanguageCode" = 1033 }) } } } }
        "Memo"     = @{ "@odata.type" = "Microsoft.Dynamics.CRM.MemoAttributeMetadata"; "AttributeType" = "Memo"; "MaxLength" = 100000; "Format" = "TextArea" }
        "DateTime" = @{ "@odata.type" = "Microsoft.Dynamics.CRM.DateTimeAttributeMetadata"; "AttributeType" = "DateTime"; "Format" = "DateAndTime"; "DateTimeBehavior" = @{ "Value" = "TimeZoneIndependent" } }
    }
    $column = $columnTypes[$Type].Clone()
    $column["SchemaName"] = $SchemaName
    $column["DisplayName"] = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = $DisplayName; "LanguageCode" = 1033 }) }
    $column["RequiredLevel"] = @{ "Value" = "None" }
    Write-Host "    [CREATE] Adding column '$SchemaName' to '$TableName'..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri "$BaseUrl/EntityDefinitions(LogicalName='$($TableName.ToLower())')/Attributes" -Method Post -Headers $Headers -Body ($column | ConvertTo-Json -Depth 10) | Out-Null
    Write-Host "    [OK] Column '$SchemaName' added" -ForegroundColor Green
}

function Add-DataverseLookupIfNotExists {
    param(
        [string]$SourceTable, [string]$TargetTable, [string]$SchemaName, [string]$DisplayName,
        [string]$RelationshipSchemaName, [string]$BaseUrl, [hashtable]$Headers
    )
    if (Test-ColumnExists -TableLogicalName $SourceTable -ColumnLogicalName $SchemaName.ToLower() -BaseUrl $BaseUrl -Headers $Headers) {
        Write-Host "    [SKIP] Lookup '$SchemaName' already exists on '$SourceTable'" -ForegroundColor Yellow
        return
    }
    $lookup = @{
        "@odata.type"       = "Microsoft.Dynamics.CRM.OneToManyRelationshipMetadata"
        "SchemaName"        = $RelationshipSchemaName
        "ReferencedEntity"  = $TargetTable
        "ReferencingEntity" = $SourceTable
        "Lookup"            = @{
            "@odata.type" = "Microsoft.Dynamics.CRM.LookupAttributeMetadata"
            "SchemaName"  = $SchemaName
            "DisplayName" = @{ "@odata.type" = "Microsoft.Dynamics.CRM.Label"; "LocalizedLabels" = @(@{ "@odata.type" = "Microsoft.Dynamics.CRM.LocalizedLabel"; "Label" = $DisplayName; "LanguageCode" = 1033 }) }
        }
        "CascadeConfiguration" = @{ "Assign" = "NoCascade"; "Delete" = "RemoveLink"; "Merge" = "NoCascade"; "Reparent" = "NoCascade"; "Share" = "NoCascade"; "Unshare" = "NoCascade" }
    }
    Write-Host "    [CREATE] Adding lookup '$SchemaName' on '$SourceTable' -> '$TargetTable'..." -ForegroundColor Cyan
    Invoke-RestMethod -Uri "$BaseUrl/RelationshipDefinitions" -Method Post -Headers $Headers -Body ($lookup | ConvertTo-Json -Depth 10) | Out-Null
    Write-Host "    [OK] Lookup created" -ForegroundColor Green
}

# --- Main ---
$api = Initialize-DataverseApi -EnvironmentUrl $EnvironmentUrl
$headers = $api.Headers
$baseUrl = $api.BaseUrl
$prefix = $api.PublisherPrefix
Write-Host "Publisher prefix: $prefix" -ForegroundColor Cyan

$squadTable = "${prefix}_squad"
$squadPlayerTable = "${prefix}_squadplayer"
$recommendationTable = "${prefix}_recommendationlog"
$scoutLineupTable = "${prefix}_scoutlineup"

New-DataverseTableIfNotExists -SchemaName $squadTable -DisplayName "FPL Squad" -PluralDisplayName "FPL Squads" -PrimaryColumnName "${prefix}_name" -PrimaryColumnDisplayName "Name" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadTable -SchemaName "${prefix}_banktenths" -DisplayName "Bank (tenths)" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadTable -SchemaName "${prefix}_freetransfers" -DisplayName "Free Transfers" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadTable -SchemaName "${prefix}_chipsavailablejson" -DisplayName "Chips Available (JSON)" -Type "Memo" -BaseUrl $baseUrl -Headers $headers

New-DataverseTableIfNotExists -SchemaName $squadPlayerTable -DisplayName "FPL Squad Player" -PluralDisplayName "FPL Squad Players" -PrimaryColumnName "${prefix}_name" -PrimaryColumnDisplayName "Name" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadPlayerTable -SchemaName "${prefix}_playerid" -DisplayName "Player Id" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadPlayerTable -SchemaName "${prefix}_purchasepricetenths" -DisplayName "Purchase Price (tenths)" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadPlayerTable -SchemaName "${prefix}_instartingxi" -DisplayName "In Starting XI" -Type "Boolean" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadPlayerTable -SchemaName "${prefix}_iscaptain" -DisplayName "Is Captain" -Type "Boolean" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $squadPlayerTable -SchemaName "${prefix}_isvicecaptain" -DisplayName "Is Vice Captain" -Type "Boolean" -BaseUrl $baseUrl -Headers $headers
Add-DataverseLookupIfNotExists -SourceTable $squadPlayerTable -TargetTable $squadTable -SchemaName "${prefix}_squadid_lookup" -DisplayName "Squad" -RelationshipSchemaName "${prefix}_${squadTable}_${squadPlayerTable}" -BaseUrl $baseUrl -Headers $headers

New-DataverseTableIfNotExists -SchemaName $recommendationTable -DisplayName "FPL Recommendation Log" -PluralDisplayName "FPL Recommendation Logs" -PrimaryColumnName "${prefix}_name" -PrimaryColumnDisplayName "Name" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $recommendationTable -SchemaName "${prefix}_gameweek" -DisplayName "Gameweek" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $recommendationTable -SchemaName "${prefix}_horizongameweeks" -DisplayName "Horizon Gameweeks" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $recommendationTable -SchemaName "${prefix}_resultjson" -DisplayName "Result (JSON)" -Type "Memo" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $recommendationTable -SchemaName "${prefix}_actioned" -DisplayName "Actioned" -Type "Boolean" -BaseUrl $baseUrl -Headers $headers
Add-DataverseLookupIfNotExists -SourceTable $recommendationTable -TargetTable $squadTable -SchemaName "${prefix}_squadid_lookup" -DisplayName "Squad" -RelationshipSchemaName "${prefix}_${squadTable}_${recommendationTable}" -BaseUrl $baseUrl -Headers $headers

# Holds the latest Fantasy Football Scout predicted line-ups as a single refreshed row, so the
# app reads live team news instead of a snapshot baked in at build time.
New-DataverseTableIfNotExists -SchemaName $scoutLineupTable -DisplayName "FPL Scout Lineup" -PluralDisplayName "FPL Scout Lineups" -PrimaryColumnName "${prefix}_name" -PrimaryColumnDisplayName "Name" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $scoutLineupTable -SchemaName "${prefix}_starteridsjson" -DisplayName "Predicted Starter Ids (JSON)" -Type "Memo" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $scoutLineupTable -SchemaName "${prefix}_refreshedon" -DisplayName "Refreshed On" -Type "DateTime" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $scoutLineupTable -SchemaName "${prefix}_teamcount" -DisplayName "Teams Matched" -Type "Integer" -BaseUrl $baseUrl -Headers $headers
Add-DataverseColumnIfNotExists -TableName $scoutLineupTable -SchemaName "${prefix}_startercount" -DisplayName "Starters Matched" -Type "Integer" -BaseUrl $baseUrl -Headers $headers

Write-Host "`nDone. Tables: $squadTable, $squadPlayerTable, $recommendationTable, $scoutLineupTable (prefix: $prefix)" -ForegroundColor Green
