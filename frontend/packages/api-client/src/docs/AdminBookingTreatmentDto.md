# AdminBookingTreatmentDto


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**roomId** | [**AddCustomerNoteRequestChainId**](AddCustomerNoteRequestChainId.md) |  | [default to undefined]
**treatmentName** | **string** |  | [default to undefined]
**roomName** | **string** |  | [default to undefined]
**therapistName** | **string** |  | [default to undefined]
**startTime** | **string** |  | [default to undefined]
**endTime** | **string** |  | [default to undefined]
**slotCount** | [**AdminBookingTreatmentDtoSlotCount**](AdminBookingTreatmentDtoSlotCount.md) |  | [default to undefined]
**price** | [**AdminBookingTreatmentDtoPrice**](AdminBookingTreatmentDtoPrice.md) |  | [default to undefined]
**treatmentId** | [**AdminBookingDtoCustomerId**](AdminBookingDtoCustomerId.md) |  | [optional] [default to undefined]
**therapistId** | [**AddCustomerNoteRequestChainId**](AddCustomerNoteRequestChainId.md) |  | [optional] [default to undefined]

## Example

```typescript
import { AdminBookingTreatmentDto } from './api';

const instance: AdminBookingTreatmentDto = {
    roomId,
    treatmentName,
    roomName,
    therapistName,
    startTime,
    endTime,
    slotCount,
    price,
    treatmentId,
    therapistId,
};
```

[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)
